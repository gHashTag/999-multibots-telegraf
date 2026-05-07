use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "clips")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub brand: Option<String>,
    pub response: Option<String>,
    pub video_url: Option<String>,
    pub command: Option<String>,
    pub r#type: Option<String>,
    pub voice_id: Option<String>,
    pub chat_id: Option<String>,
    pub lang: Option<String>,
    pub trigger: Option<String>,
    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
