use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m00000000000002_job_queue"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("job_queue"))
                    .if_not_exists()
                    .col(ColumnDef::new(Alias::new("id")).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Alias::new("job_type")).text().not_null())
                    .col(ColumnDef::new(Alias::new("payload")).json().not_null())
                    .col(ColumnDef::new(Alias::new("status")).text().not_null().default("queued"))
                    .col(ColumnDef::new(Alias::new("attempts")).integer().not_null().default(0))
                    .col(ColumnDef::new(Alias::new("max_attempts")).integer().not_null().default(3))
                    .col(ColumnDef::new(Alias::new("scheduled_at")).timestamp_with_time_zone().null())
                    .col(ColumnDef::new(Alias::new("started_at")).timestamp_with_time_zone().null())
                    .col(ColumnDef::new(Alias::new("completed_at")).timestamp_with_time_zone().null())
                    .col(ColumnDef::new(Alias::new("error")).text().null())
                    .col(ColumnDef::new(Alias::new("created_at")).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                    .col(ColumnDef::new(Alias::new("updated_at")).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_job_queue_status_type")
                    .table(Alias::new("job_queue"))
                    .col(Alias::new("status"))
                    .col(Alias::new("job_type"))
                    .col(Alias::new("scheduled_at"))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_job_queue_status_scheduled")
                    .table(Alias::new("job_queue"))
                    .col(Alias::new("status"))
                    .col(Alias::new("scheduled_at"))
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Alias::new("job_queue")).to_owned())
            .await
    }
}
