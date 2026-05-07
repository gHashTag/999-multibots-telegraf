use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "generations")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub telegram_id: i64,
    pub media_type: String,
    pub status: String,
    pub prompt: Option<String>,
    pub result_url: Option<String>,
    pub provider: Option<String>,
    pub params: Option<Json>,
    pub error: Option<String>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
