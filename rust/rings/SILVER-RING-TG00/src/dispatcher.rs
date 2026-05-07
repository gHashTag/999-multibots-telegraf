use std::sync::Arc;
use teloxide::dispatching::dialogue::InMemStorage;
use teloxide::dispatching::{Dispatcher, DefaultKey};
use teloxide::dptree;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use crate::state::Scene;

pub type HandlerResult = Result<(), Box<dyn std::error::Error + Send + Sync>>;
pub type HandlerError = Box<dyn std::error::Error + Send + Sync>;

pub struct BotDispatcher {
    db: Arc<dyn Database>,
    orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    storage: Arc<InMemStorage<Scene>>,
}

impl BotDispatcher {
    pub fn new(
        db: Arc<dyn Database>,
        orchestrator: Arc<dyn AiProviderOrchestrator>,
        job_queue: Arc<dyn JobQueue>,
    ) -> Self {
        Self {
            db,
            orchestrator,
            job_queue,
            storage: InMemStorage::new(),
        }
    }

    pub fn storage(&self) -> Arc<InMemStorage<Scene>> {
        self.storage.clone()
    }

    pub fn build_dispatcher(
        &self,
        bot: teloxide::Bot,
        scene_tree: teloxide::dispatching::UpdateHandler<HandlerError>,
    ) -> Dispatcher<teloxide::Bot, HandlerError, DefaultKey> {
        let deps = dptree::deps![
            self.db.clone(),
            self.orchestrator.clone(),
            self.job_queue.clone(),
            self.storage.clone()
        ];

        Dispatcher::builder(bot, scene_tree)
            .dependencies(deps)
            .build()
    }
}
