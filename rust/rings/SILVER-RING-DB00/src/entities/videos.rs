use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "videos")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub telegram_id: i64,
    pub video_url: Option<String>,
    pub prompt: Option<String>,
    pub model: Option<String>,
    pub status: String,
    pub provider: Option<String>,
    pub duration: Option<f64>,
    pub aspect_ratio: Option<String>,
    pub error: Option<String>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
