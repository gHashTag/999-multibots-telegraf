use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m00000000000000_initial"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("users"))
                    .if_not_exists()
                    .col(ColumnDef::new(Alias::new("id")).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Alias::new("telegram_id")).big_integer().not_null())
                    .col(ColumnDef::new(Alias::new("username")).text().null())
                    .col(ColumnDef::new(Alias::new("language")).text().not_null().default("ru"))
                    .col(ColumnDef::new(Alias::new("gender")).text().null())
                    .col(ColumnDef::new(Alias::new("level")).integer().not_null().default(1))
                    .col(ColumnDef::new(Alias::new("balance")).double().not_null().default(0.0))
                    .col(ColumnDef::new(Alias::new("voice")).text().null())
                    .col(ColumnDef::new(Alias::new("model")).text().null())
                    .col(ColumnDef::new(Alias::new("subscription")).text().null())
                    .col(ColumnDef::new(Alias::new("created_at")).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                    .col(ColumnDef::new(Alias::new("updated_at")).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_users_telegram_id")
                    .table(Alias::new("users"))
                    .col(Alias::new("telegram_id"))
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Alias::new("payments_v2"))
                    .if_not_exists()
                    .col(ColumnDef::new(Alias::new("id")).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Alias::new("telegram_id")).big_integer().not_null())
                    .col(ColumnDef::new(Alias::new("method")).text().not_null())
                    .col(ColumnDef::new(Alias::new("status")).text().not_null())
                    .col(ColumnDef::new(Alias::new("amount")).double().not_null())
                    .col(ColumnDef::new(Alias::new("currency")).text().not_null())
                    .col(ColumnDef::new(Alias::new("external_id")).text().null())
                    .col(ColumnDef::new(Alias::new("created_at")).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                    .col(ColumnDef::new(Alias::new("updated_at")).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Alias::new("prompts"))
                    .if_not_exists()
                    .col(ColumnDef::new(Alias::new("id")).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Alias::new("telegram_id")).big_integer().not_null())
                    .col(ColumnDef::new(Alias::new("prompt")).text().null())
                    .col(ColumnDef::new(Alias::new("result_url")).text().null())
                    .col(ColumnDef::new(Alias::new("created_at")).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_prompts_telegram_id")
                    .table(Alias::new("prompts"))
                    .col(Alias::new("telegram_id"))
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Alias::new("generations"))
                    .if_not_exists()
                    .col(ColumnDef::new(Alias::new("id")).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Alias::new("telegram_id")).big_integer().not_null())
                    .col(ColumnDef::new(Alias::new("media_type")).text().not_null())
                    .col(ColumnDef::new(Alias::new("status")).text().not_null())
                    .col(ColumnDef::new(Alias::new("prompt")).text().null())
                    .col(ColumnDef::new(Alias::new("result_url")).text().null())
                    .col(ColumnDef::new(Alias::new("provider")).text().null())
                    .col(ColumnDef::new(Alias::new("params")).json().null())
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
                    .name("idx_generations_telegram_id")
                    .table(Alias::new("generations"))
                    .col(Alias::new("telegram_id"))
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Alias::new("model_training"))
                    .if_not_exists()
                    .col(ColumnDef::new(Alias::new("id")).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Alias::new("telegram_id")).big_integer().not_null())
                    .col(ColumnDef::new(Alias::new("model_name")).text().null())
                    .col(ColumnDef::new(Alias::new("model_type")).text().null())
                    .col(ColumnDef::new(Alias::new("status")).text().not_null())
                    .col(ColumnDef::new(Alias::new("trigger_word")).text().null())
                    .col(ColumnDef::new(Alias::new("training_url")).text().null())
                    .col(ColumnDef::new(Alias::new("created_at")).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                    .col(ColumnDef::new(Alias::new("updated_at")).timestamp_with_time_zone().not_null().default(Expr::current_timestamp()))
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.drop_table(Table::drop().table(Alias::new("model_training")).to_owned()).await?;
        manager.drop_table(Table::drop().table(Alias::new("generations")).to_owned()).await?;
        manager.drop_table(Table::drop().table(Alias::new("prompts")).to_owned()).await?;
        manager.drop_table(Table::drop().table(Alias::new("payments_v2")).to_owned()).await?;
        manager.drop_table(Table::drop().table(Alias::new("users")).to_owned()).await?;
        Ok(())
    }
}

pub struct Migrator;

impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(Migration),
            Box::new(crate::migration_add_tables::Migration),
            Box::new(crate::migration_job_queue::Migration),
        ]
    }
}
