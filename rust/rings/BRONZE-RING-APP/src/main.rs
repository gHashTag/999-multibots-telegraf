use std::sync::Arc;
use tracing::{info, warn, error};
use trios_mb_types::config::AppConfig;
use trios_mb_traits::{SecretStore, Database, PaymentGateway};

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

    // 3. Payment gateways
    let robokassa_login = secret_store.get("ROBOKASSA_MERCHANT_LOGIN").await.unwrap_or_default();
    let robokassa_pw1 = secret_store.get("ROBOKASSA_PASSWORD1").await.unwrap_or_default();
    let robokassa_pw2 = secret_store.get("ROBOKASSA_PASSWORD2").await.unwrap_or_default();
    let payment_gateway: Arc<dyn PaymentGateway> = Arc::new(
        trios_mb_payment::RobokassaGateway::new(&robokassa_login, &robokassa_pw1, &robokassa_pw2)
    );

    // 4. HTTP Server with webhooks
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

    // 5. Background Job Workers
    let job_queue: Arc<dyn trios_mb_traits::JobQueue> = Arc::new(
        trios_mb_jobs::PgJobQueue::new(pg_conn)
    );

    let cancel_token = tokio_util::sync::CancellationToken::new();
    let cancel_clone = cancel_token.clone();
    let jq = job_queue.clone();
    let maintenance_handle = tokio::spawn(async move {
        trios_mb_jobs::run_retry_maintenance(jq, std::time::Duration::from_secs(300), cancel_clone).await;
    });

    info!("job queue workers started");

    // 6. Telegram Bot Dispatchers
    let dispatcher = trios_mb_tg::dispatcher::BotDispatcher::new(db.clone());

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

    // 7. Graceful Shutdown
    tokio::select! {
        _ = server_handle => info!("server stopped"),
        _ = tokio::signal::ctrl_c() => info!("received ctrl+c, shutting down"),
    }

    cancel_token.cancel();
    info!("shutting down workers...");

    for handle in bot_handles {
        handle.abort();
    }

    maintenance_handle.abort();

    info!("trios-mb shutdown complete");
    Ok(())
}
