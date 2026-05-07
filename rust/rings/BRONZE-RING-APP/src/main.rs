use std::sync::Arc;
use tracing::{info, warn};
use trios_mb_types::config::AppConfig;
use trios_mb_traits::{SecretStore, Database, PaymentGateway, AiProvider, AiProviderOrchestrator, JobQueue};
use trios_mb_ai::providers::*;
use trios_mb_ai::AiOrchestrator;
use trios_mb_jobs::worker::{WorkerPool, JobType};
use teloxide::prelude::Requester;

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
    let robokassa_login = secret_store.get("ROBOKASSA_MERCHANT_LOGIN").await.unwrap_or_default();
    let robokassa_pw1 = secret_store.get("ROBOKASSA_PASSWORD1").await.unwrap_or_default();
    let robokassa_pw2 = secret_store.get("ROBOKASSA_PASSWORD2").await.unwrap_or_default();
    let payment_gateway: Arc<dyn PaymentGateway> = Arc::new(
        trios_mb_payment::RobokassaGateway::new(&robokassa_login, &robokassa_pw1, &robokassa_pw2)
    );

    // 5. HTTP Server with webhooks
    let server_db = db.clone();
    let server_gw = payment_gateway.clone();
    let http_port = config.http_port;
    let server_handle = tokio::spawn(async move {
        let router = trios_mb_server::create_router_with_payments(server_db, server_gw);
        let addr = std::net::SocketAddr::from(([0, 0, 0, 0], http_port));
        info!(addr = %addr, "HTTP server starting");
        axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), router)
            .await
            .unwrap();
    });

    // 6. Background Job Workers
    let job_queue: Arc<dyn JobQueue> = Arc::new(
        trios_mb_jobs::PgJobQueue::new(pg_conn)
    );

    let cancel_token = tokio_util::sync::CancellationToken::new();
    let cancel_clone = cancel_token.clone();
    let jq = job_queue.clone();
    let maintenance_handle = tokio::spawn(async move {
        trios_mb_jobs::run_retry_maintenance(jq, std::time::Duration::from_secs(300), cancel_clone).await;
    });

    // Primary bot for result delivery
    let primary_bot_token = secret_store.get("BOT_TOKEN_1").await.unwrap_or_default();
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

    let mut bot_handles = Vec::new();
    for i in 1..=15 {
        let key = format!("BOT_TOKEN_{}", i);
        match secret_store.get(&key).await {
            Ok(token) if !token.is_empty() => {
                info!(bot = i, token_key = %key, "spawning bot");
                let bot = teloxide::Bot::new(&token);
                let dp = dispatcher.build_dispatcher(bot, trios_mb_scenes::build_scene_tree());
                let handle = tokio::spawn(async move {
                    info!(bot = i, "bot dispatcher starting (polling)");
                    let mut dp = dp;
                    dp.dispatch().await;
                });
                bot_handles.push(handle);
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

    for handle in bot_handles {
        handle.abort();
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

    let request = serde_json::from_value::<GenerationRequest>(job.payload.clone())
        .unwrap_or_else(|_| GenerationRequest {
            telegram_id: 0,
            media_type: MediaType::Image,
            prompt: None,
            image_url: None,
            model: None,
            params: serde_json::json!({}),
        });

    let cost: f64 = request.params.get("cost")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    match orchestrator.dispatch(&request).await {
        Ok(result) => {
            if let Err(e) = db.update_generation_status(
                job.id, GenerationStatus::Completed,
                result.result_url.as_deref(), None,
            ).await {
                tracing::error!(error = %e, "Failed to update generation status");
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

            let _ = db.update_generation_status(
                job.id, GenerationStatus::Failed, None, Some(&e.to_string()),
            ).await;

            let chat_id = teloxide::types::ChatId(request.telegram_id);
            let err_msg = format!("❌ Ошибка генерации. Средства возвращены ({} ⭐).", cost);
            if let Err(send_err) = bot.send_message(chat_id, &err_msg).await {
                tracing::error!(telegram_id = request.telegram_id, error = %send_err, "Failed to deliver error to user");
            }

            Err(e)
        }
    }
}
