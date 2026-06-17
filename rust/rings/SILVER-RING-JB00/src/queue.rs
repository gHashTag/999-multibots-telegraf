use async_trait::async_trait;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ConnectionTrait, DatabaseConnection,
    EntityTrait, FromQueryResult, Statement, Value,
};
use std::sync::Arc;
use trios_mb_traits::job_queue::*;
use trios_mb_types::errors::DbError;
use trios_mb_types::AppError;

mod job_queue_entity {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "job_queue")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: Uuid,
        pub job_type: String,
        pub payload: Json,
        pub status: String,
        pub attempts: i32,
        pub max_attempts: i32,
        pub scheduled_at: Option<DateTimeWithTimeZone>,
        pub started_at: Option<DateTimeWithTimeZone>,
        pub completed_at: Option<DateTimeWithTimeZone>,
        pub error: Option<String>,
        pub created_at: DateTimeWithTimeZone,
        pub updated_at: DateTimeWithTimeZone,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

use job_queue_entity::Model;

pub struct PgJobQueue {
    db: Arc<DatabaseConnection>,
}

impl PgJobQueue {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }
}

fn row_to_job(row: &Model) -> Job {
    Job {
        id: row.id,
        job_type: row.job_type.clone(),
        payload: row.payload.clone(),
        status: match row.status.as_str() {
            "queued" => JobStatus::Queued,
            "running" => JobStatus::Running,
            "completed" => JobStatus::Completed,
            "failed" => JobStatus::Failed,
            "cancelled" => JobStatus::Cancelled,
            _ => JobStatus::Queued,
        },
        attempts: row.attempts,
        max_attempts: row.max_attempts,
        scheduled_at: row.scheduled_at.map(chrono::DateTime::<chrono::Utc>::from),
        started_at: row.started_at.map(chrono::DateTime::<chrono::Utc>::from),
        completed_at: row.completed_at.map(chrono::DateTime::<chrono::Utc>::from),
        error: row.error.clone(),
        created_at: chrono::DateTime::<chrono::Utc>::from(row.created_at),
    }
}

#[async_trait]
impl JobQueue for PgJobQueue {
    async fn enqueue(&self, request: EnqueueRequest) -> Result<Job, AppError> {
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();
        let scheduled_at = request
            .delay_secs
            .map(|d| now + chrono::Duration::seconds(d as i64));

        let active_model = job_queue_entity::ActiveModel {
            id: Set(id),
            job_type: Set(request.job_type),
            payload: Set(request.payload),
            status: Set("queued".to_string()),
            attempts: Set(0),
            max_attempts: Set(request.max_attempts.unwrap_or(3)),
            scheduled_at: Set(scheduled_at.map(|dt| dt.into())),
            started_at: Set(None),
            completed_at: Set(None),
            error: Set(None),
            created_at: Set(now.into()),
            updated_at: Set(now.into()),
        };

        let inserted = active_model
            .insert(self.db.as_ref())
            .await
            .map_err(|e| AppError::Db(DbError::Query(e.to_string())))?;

        Ok(row_to_job(&inserted))
    }

    async fn dequeue(&self, job_types: &[&str]) -> Result<Option<Job>, AppError> {
        if job_types.is_empty() {
            return Ok(None);
        }

        let placeholders: Vec<String> = (1..=job_types.len())
            .map(|i| format!("${}", i))
            .collect();
        let types_placeholders = placeholders.join(", ");

        let sql = format!(
            r#"
            UPDATE job_queue
            SET status = 'running',
                attempts = attempts + 1,
                started_at = NOW(),
                updated_at = NOW()
            WHERE id = (
                SELECT id FROM job_queue
                WHERE status = 'queued'
                  AND (scheduled_at IS NULL OR scheduled_at <= NOW())
                  AND job_type IN ({types_placeholders})
                ORDER BY created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id, job_type, payload, status, attempts, max_attempts,
                      scheduled_at, started_at, completed_at, error, created_at, updated_at
            "#,
        );

        let values: Vec<Value> = job_types
            .iter()
            .map(|t| Value::String(Some(Box::new(t.to_string()))))
            .collect();

        let result = Model::find_by_statement(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            &sql,
            values,
        ))
        .one(self.db.as_ref())
        .await
        .map_err(|e| AppError::Db(DbError::Query(e.to_string())))?;

        Ok(result.map(|r| row_to_job(&r)))
    }

    async fn update_status(
        &self,
        id: uuid::Uuid,
        status: JobStatus,
        error: Option<&str>,
    ) -> Result<(), AppError> {
        let status_str = match status {
            JobStatus::Queued => "queued",
            JobStatus::Running => "running",
            JobStatus::Completed => "completed",
            JobStatus::Failed => "failed",
            JobStatus::Cancelled => "cancelled",
        };

        let is_terminal = matches!(
            status,
            JobStatus::Completed | JobStatus::Failed | JobStatus::Cancelled
        );

        let (sql, values): (String, Vec<Value>) = if is_terminal {
            (
                r#"
                UPDATE job_queue
                SET status = $1,
                    error = $2,
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE id = $3
                "#.to_string(),
                vec![
                    Value::String(Some(Box::new(status_str.to_string()))),
                    error.map_or(Value::String(None), |e| Value::String(Some(Box::new(e.to_string())))),
                    Value::Uuid(Some(Box::new(id))),
                ],
            )
        } else {
            (
                r#"
                UPDATE job_queue
                SET status = $1,
                    error = $2,
                    updated_at = NOW()
                WHERE id = $3
                "#.to_string(),
                vec![
                    Value::String(Some(Box::new(status_str.to_string()))),
                    error.map_or(Value::String(None), |e| Value::String(Some(Box::new(e.to_string())))),
                    Value::Uuid(Some(Box::new(id))),
                ],
            )
        };

        self.db
            .as_ref()
            .execute(Statement::from_sql_and_values(
                sea_orm::DatabaseBackend::Postgres,
                &sql,
                values,
            ))
            .await
            .map_err(|e| AppError::Db(DbError::Query(e.to_string())))?;

        Ok(())
    }

    async fn get(&self, id: uuid::Uuid) -> Result<Option<Job>, AppError> {
        let row = job_queue_entity::Entity::find_by_id(id)
            .one(self.db.as_ref())
            .await
            .map_err(|e| AppError::Db(DbError::Query(e.to_string())))?;

        Ok(row.map(|r| row_to_job(&r)))
    }

    async fn cancel(&self, id: uuid::Uuid) -> Result<(), AppError> {
        self.update_status(id, JobStatus::Cancelled, None).await
    }

    async fn retry_stuck(&self, older_than_secs: u64) -> Result<u64, AppError> {
        let sql = r#"
            UPDATE job_queue
            SET status = 'queued', attempts = 0, started_at = NULL, updated_at = NOW()
            WHERE status = 'running'
              AND started_at < NOW() - INTERVAL '1 second' * $1
              AND attempts < max_attempts
        "#;

        let result = self
            .db
            .as_ref()
            .execute(Statement::from_sql_and_values(
                sea_orm::DatabaseBackend::Postgres,
                sql,
                vec![Value::Int(Some(older_than_secs as i32))],
            ))
            .await
            .map_err(|e| AppError::Db(DbError::Query(e.to_string())))?;

        Ok(result.rows_affected())
    }
}
