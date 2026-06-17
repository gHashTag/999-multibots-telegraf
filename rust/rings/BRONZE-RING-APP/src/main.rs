use std::sync::Arc;
use tracing::{info, warn};
use trios_mb_types::config::AppConfig;
use trios_mb_traits::{SecretStore, Database, PaymentGateway, AiProvider, AiProviderOrchestrator, JobQueue};
use trios_mb_ai::providers::*;
use trios_mb_ai::AiOrchestrator;
use trios_mb_jobs::worker::{WorkerPool, JobType};
use teloxide::prelude::Requester;
use futures_util::FutureExt;

/// Spawn a background task with panic-aware supervision and exponential backoff.
/// If the inner task panics, it is logged and restarted with a capped exponential delay.
/// After `max_consecutive_failures` consecutive panics, the supervisor escalates to fatal.
fn spawn_traced<F, Fut>(
    desc: &'static str,
    cancel: tokio_util::sync::CancellationToken,
    factory: F,
) -> tokio::task::JoinHandle<()>
where
    F: Fn() -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    tokio::spawn(async move {
        let mut consecutive_failures: u32 = 0;
        const MAX_CONSECUTIVE_FAILURES: u32 = 10;
        const BASE_BACKOFF_SECS: u64 = 5;
        const MAX_BACKOFF_SECS: u64 = 60;

        loop {
            tokio::select! {
                biased;
                _ = cancel.cancelled() => {
                    tracing::info!(task = %desc, "Supervised task shutting down gracefully");
                    break;
                }
                result = std::panic::AssertUnwindSafe(factory()).catch_unwind() => {
                    match result {
                        Ok(()) => {
                            tracing::info!(task = %desc, "Supervised task completed normally");
                            break;
                        }
                        Err(_) => {
                            consecutive_failures += 1;
                            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                                tracing::error!(
                                    task = %desc,
                                    failures = consecutive_failures,
                                    "Supervised task exceeded max consecutive failures; giving up"
                                );
                                break;
                            }
                            let backoff = std::cmp::min(
                                BASE_BACKOFF_SECS * 2_u64.pow(consecutive_failures.min(4)),
                                MAX_BACKOFF_SECS,
                            );
                            tracing::error!(
                                task = %desc,
                                failures = consecutive_failures,
                                backoff_secs = backoff,
                                "Supervised task panicked; restarting with backoff"
                            );
                            tokio::time::sleep(std::time::Duration::from_secs(backoff)).await;
                        }
                    }
                }
            }
        }
    })
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("trios-mb starting...");

    let config = AppConfig::from_env()?;
    info!(env = %config.infisical_environment, port = config.http_port, "config loaded");

    // 1. Secrets
    let secret_store = Arc::new(trios_mb_secrets::InfisicalStore::new(
        &config.infisical_client_id,
        &config.infisical_client_secret,
        &config.infisical_project_id,
        &config.infisical_environment,
    ));
    info!("loading secrets from Infisical...");
    secret_store.reload().await?;
    info!("secrets loaded");

    // 2. Database
    let db_url = secret_store.get("DATABASE_URL").await
        .unwrap_or_else(|_| config.database_url.clone());
    let pg = trios_mb_db::PostgresDatabase::connect(&db_url).await?;
    let pg_conn = pg.connection_arc();
    pg.run_migrations().await?;
    info!("database connected, migrations complete");
    let db: Arc<dyn Database> = Arc::new(pg);

    // 3. AI Orchestrator (7 providers with failover + circuit breakers)
    let orchestrator = build_orchestrator(&secret_store).await;
    let orchestrator: Arc<dyn AiProviderOrchestrator> = Arc::new(orchestrator);
    info!("AI orchestrator initialized");

    // 4. Payment gateways
    let robokassa_login = secret_store.get("ROBOKASSA_MERCHANT_LOGIN").await?;
    if robokassa_login.is_empty() {
        anyhow::bail!("ROBOKASSA_MERCHANT_LOGIN is required but empty");
    }
    let robokassa_pw1 = secret_store.get("ROBOKASSA_PASSWORD1").await?;
    if robokassa_pw1.is_empty() {
        anyhow::bail!("ROBOKASSA_PASSWORD1 is required but empty");
    }
    let robokassa_pw2 = secret_store.get("ROBOKASSA_PASSWORD2").await?;
    if robokassa_pw2.is_empty() {
        anyhow::bail!("ROBOKASSA_PASSWORD2 is required but empty");
    }
    let payment_gateway: Arc<dyn PaymentGateway> = Arc::new(
        trios_mb_payment::RobokassaGateway::new(&robokassa_login, &robokassa_pw1, &robokassa_pw2)
    );

    let cancel_token = tokio_util::sync::CancellationToken::new();

    // 5. HTTP Server with webhooks
    let server_db = db.clone();
    let server_gw = payment_gateway.clone();
    let http_port = config.http_port;
    let server_cancel = cancel_token.clone();
    let server_handle = tokio::spawn(async move {
        let server_inner = async {
            let router = trios_mb_server::create_router_with_payments(server_db, server_gw);
            let addr = std::net::SocketAddr::from(([0, 0, 0, 0], http_port));
            info!(addr = %addr, "HTTP server starting");
            let listener = match tokio::net::TcpListener::bind(addr).await {
                Ok(l) => l,
                Err(e) => {
                    tracing::error!(addr = %addr, error = %e, "Failed to bind HTTP listener");
                    return Err(anyhow::anyhow!("Failed to bind HTTP listener on {}: {}", addr, e));
                }
            };
            if let Err(e) = axum::serve(listener, router).await {
                tracing::error!(addr = %addr, error = %e, "HTTP server error");
                return Err(anyhow::anyhow!("HTTP server error: {}", e));
            }
            Ok(())
        };
        tokio::select! {
            biased;
            _ = server_cancel.cancelled() => {
                tracing::info!("HTTP server shutting down gracefully");
            }
            result = std::panic::AssertUnwindSafe(server_inner).catch_unwind() => {
                match result {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => tracing::error!(error = %e, "HTTP server error"),
                    Err(_) => tracing::error!("HTTP server panicked"),
                }
            }
        }
    });

    // 6. Background Job Workers
    let job_queue: Arc<dyn JobQueue> = Arc::new(
        trios_mb_jobs::PgJobQueue::new(pg_conn)
    );

    let maintenance_handle = {
        let jq = job_queue.clone();
        let cancel = cancel_token.child_token();
        let cancel_token_clone = cancel_token.clone();
        spawn_traced("retry_maintenance", cancel, move || {
            let jq = jq.clone();
            let cancel = cancel_token_clone.child_token();
            async move {
                trios_mb_jobs::run_retry_maintenance(jq, std::time::Duration::from_secs(300), cancel).await;
            }
        })
    };

    // Primary bot for result delivery
    let primary_bot_token = secret_store.get("BOT_TOKEN_1").await?;
    if primary_bot_token.is_empty() {
        anyhow::bail!("BOT_TOKEN_1 is required but empty");
    }
    let delivery_bot: Arc<teloxide::Bot> = Arc::new(teloxide::Bot::new(&primary_bot_token));

    let worker_pool = build_worker_pool(job_queue.clone(), orchestrator.clone(), db.clone(), delivery_bot.clone());
    let worker_pool = Arc::new(worker_pool);
    worker_pool.spawn();
    info!("job queue workers started");

    // 7. Telegram Bot Dispatchers
    let dispatcher = trios_mb_tg::dispatcher::BotDispatcher::new(
        db.clone(),
        orchestrator.clone(),
        job_queue.clone(),
    );

    let mut bot_handles: Vec<(tokio_util::sync::CancellationToken, tokio::task::JoinHandle<()>)> = Vec::new();
    for i in 1..=15 {
        let key = format!("BOT_TOKEN_{}", i);
        match secret_store.get(&key).await {
            Ok(token) if !token.is_empty() => {
                info!(bot = i, token_key = %key, "spawning bot");
                let bot = teloxide::Bot::new(&token);
                let dp_builder = dispatcher.clone();
                let bot_cancel = cancel_token.child_token();
                let bot_cancel_clone_for_closure = bot_cancel.clone();
                let desc: &'static str = Box::leak(format!("bot-{}", i).into_boxed_str());
                let bot_cancel_spawn = bot_cancel.clone();
                let handle = spawn_traced(desc, bot_cancel_spawn, move || {
                    let bot = bot.clone();
                    let dp_builder = dp_builder.clone();
                    let bot_cancel_inner = bot_cancel_clone_for_closure.clone();
                    async move {
                        let mut backoff_secs = 5u64;
                        loop {
                            let cancel_child = bot_cancel_inner.child_token();
                            let mut dp = dp_builder.build_dispatcher(
                                bot.clone(),
                                trios_mb_scenes::build_scene_tree(),
                            );
                            tokio::select! {
                                biased;
                                _ = cancel_child.cancelled() => {
                                    tracing::info!(bot = i, "bot dispatcher shutting down gracefully");
                                    break;
                                }
                                _ = dp.dispatch() => {
                                    tracing::warn!(bot = i, "Dispatcher stopped normally; restarting in {}s", backoff_secs);
                                    tokio::time::sleep(std::time::Duration::from_secs(backoff_secs)).await;
                                    backoff_secs = std::cmp::min(backoff_secs.saturating_mul(2), 60);
                                }
                            }
                        }
                    }
                });
                bot_handles.push((bot_cancel, handle));
            }
            Ok(_) => warn!(bot = i, "empty token, skipping"),
            Err(_) => warn!(bot = i, "token not found, skipping"),
        }
    }

    info!(bots = bot_handles.len(), "all bots spawned");

    // 8. Graceful Shutdown
    tokio::select! {
        _ = server_handle => info!("server stopped"),
        _ = tokio::signal::ctrl_c() => info!("received ctrl+c, shutting down"),
    }

    cancel_token.cancel();
    worker_pool.shutdown();
    info!("shutting down workers...");

    for (bot_cancel, handle) in bot_handles {
        bot_cancel.cancel();
        let _ = tokio::time::timeout(std::time::Duration::from_secs(5), handle).await;
    }

    maintenance_handle.abort();

    info!("trios-mb shutdown complete");
    Ok(())
}

async fn build_orchestrator(
    secrets: &Arc<trios_mb_secrets::InfisicalStore>,
) -> AiOrchestrator {
    let mut providers: Vec<Arc<dyn AiProvider>> = Vec::new();

    if let Ok(key) = secrets.get("REPLICATE_API_KEY").await {
        if !key.is_empty() {
            providers.push(Arc::new(ReplicateProvider::new(&key)));
        }
    }

    if let Ok(key) = secrets.get("FAL_KEY").await {
        if !key.is_empty() {
            providers.push(Arc::new(FalProvider::new(&key)));
        }
    }

    if let Ok(key) = secrets.get("KIE_API_KEY").await {
        if !key.is_empty() {
            providers.push(Arc::new(KieProvider::new(&key)));
        }
    }

    if let Ok(key) = secrets.get("OPENAI_API_KEY").await {
        if !key.is_empty() {
            providers.push(Arc::new(OpenAiProvider::new(&key)));
        }
    }

    if let Ok(key) = secrets.get("ELEVENLABS_API_KEY").await {
        if !key.is_empty() {
            providers.push(Arc::new(ElevenLabsProvider::new(&key)));
        }
    }

    if let Ok(key) = secrets.get("HEYGEN_API_KEY").await {
        if !key.is_empty() {
            providers.push(Arc::new(HeyGenProvider::new(&key)));
        }
    }

    if let Ok(key) = secrets.get("HEDRA_API_KEY").await {
        if !key.is_empty() {
            providers.push(Arc::new(HedraProvider::new(&key)));
        }
    }

    info!(providers = providers.len(), "AI providers configured");
    AiOrchestrator::new(providers)
}

fn build_worker_pool(
    queue: Arc<dyn JobQueue>,
    orchestrator: Arc<dyn AiProviderOrchestrator>,
    db: Arc<dyn Database>,
    delivery_bot: Arc<teloxide::Bot>,
) -> WorkerPool {
    use trios_mb_jobs::worker::JobHandler;

    let mut pool = WorkerPool::new(queue);

    macro_rules! register_handler {
        ($pool:expr, $job_type:expr, $handler_fn:expr) => {
            let orch = orchestrator.clone();
            let db_c = db.clone();
            let bot = delivery_bot.clone();
            $pool.register($job_type, Box::new(move |job| {
                let orch = orch.clone();
                let db = db_c.clone();
                let bot = bot.clone();
                Box::pin(async move {
                    $handler_fn(&orch, &db, &bot, &job).await
                }) as std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), trios_mb_types::AppError>> + Send>>
            }) as JobHandler);
        };
    }

    register_handler!(pool, JobType::ImageRendering, handle_generation_job);
    register_handler!(pool, JobType::VideoRendering, handle_generation_job);
    register_handler!(pool, JobType::LipSyncRendering, handle_generation_job);
    register_handler!(pool, JobType::FaceSwapRendering, handle_generation_job);
    register_handler!(pool, JobType::ModelTraining, handle_generation_job);
    register_handler!(pool, JobType::Upscaling, handle_generation_job);
    register_handler!(pool, JobType::VoiceCloning, handle_generation_job);
    register_handler!(pool, JobType::MorphingRendering, handle_generation_job);

    pool.register(JobType::Scraping, Box::new(move |job: trios_mb_traits::job_queue::Job| {
        let payload = job.payload;
        Box::pin(async move {
            tracing::info!(payload = %payload, "Scraping job executed (stub)");
            Ok::<_, trios_mb_types::AppError>(())
        }) as std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), trios_mb_types::AppError>> + Send>>
    }) as JobHandler);

    pool
}

async fn handle_generation_job(
    orchestrator: &Arc<dyn AiProviderOrchestrator>,
    db: &Arc<dyn Database>,
    bot: &Arc<teloxide::Bot>,
    job: &trios_mb_traits::job_queue::Job,
) -> Result<(), trios_mb_types::AppError> {
    use trios_mb_types::generation::*;

    // Wave 151: reject malformed job payloads instead of silently defaulting
    let request = serde_json::from_value::<GenerationRequest>(job.payload.clone())
        .map_err(|e| {
            tracing::error!(job_id = %job.id, error = %e, "Failed to deserialize generation request");
            trios_mb_types::AppError::Validation(format!("Invalid job payload: {}", e))
        })?;

    if request.telegram_id <= 0 {
        tracing::warn!(job_id = %job.id, telegram_id = request.telegram_id, "Rejecting job with invalid telegram_id");
        return Err(trios_mb_types::AppError::Validation("Invalid telegram_id".into()));
    }

    let cost: f64 = request.params.get("cost")
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite())
        .unwrap_or(0.0);

    let generation_id = request.params.get("generation_id")
        .and_then(|v| v.as_str())
        .and_then(|s| uuid::Uuid::parse_str(s).ok());

    match orchestrator.dispatch(&request).await {
        Ok(result) => {
            if let Some(gen_id) = generation_id {
                if let Err(e) = db.update_generation_status_owned(
                    gen_id, request.telegram_id, GenerationStatus::Completed,
                    result.result_url.as_deref(), None,
                ).await {
                    tracing::error!(generation_id = %gen_id, error = %e, "Failed to update generation status");
                }
            } else {
                tracing::warn!(job_id = %job.id, "Missing generation_id in job payload; skipping status update");
            }

            if let Some(ref url) = result.result_url {
                let chat_id = teloxide::types::ChatId(request.telegram_id);
                let msg = format!("✅ Результат готов!\n\n{}", url);
                if let Err(e) = bot.send_message(chat_id, &msg).await {
                    tracing::error!(telegram_id = request.telegram_id, error = %e, "Failed to deliver result to user");
                }
            }

            Ok(())
        }
        Err(e) => {
            if cost > 0.0 {
                if let Err(refund_err) = db.add_balance(request.telegram_id, cost).await {
                    tracing::error!(telegram_id = request.telegram_id, error = %refund_err, "Failed to refund balance after generation failure");
                } else {
                    tracing::info!(telegram_id = request.telegram_id, cost = cost, "Balance refunded after generation failure");
                }
            }

            if let Some(gen_id) = generation_id {
                if let Err(db_err) = db.update_generation_status_owned(
                    gen_id, request.telegram_id, GenerationStatus::Failed, None, Some(&e.to_string()),
                ).await {
                    tracing::error!(generation_id = %gen_id, error = %db_err, "Failed to persist generation failure status");
                }
            } else {
                tracing::warn!(job_id = %job.id, "Missing generation_id in job payload; skipping failure status update");
            }

            let chat_id = teloxide::types::ChatId(request.telegram_id);
            let err_msg = format!("❌ Ошибка генерации. Средства возвращены ({} ⭐).", cost);
            if let Err(send_err) = bot.send_message(chat_id, &err_msg).await {
                tracing::error!(telegram_id = request.telegram_id, error = %send_err, "Failed to deliver error to user");
            }

            Err(e)
        }
    }
}
