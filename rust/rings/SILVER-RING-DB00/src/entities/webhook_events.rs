use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "webhook_events")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub provider: String,
    #[sea_orm(primary_key)]
    pub event_id: String,
    pub processed_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
