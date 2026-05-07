use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "subscriptions")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub telegram_id: i64,
    pub subscription_type: String,
    pub status: String,
    pub started_at: Option<DateTimeUtc>,
    pub expires_at: Option<DateTimeUtc>,
    pub auto_renew: bool,
    pub payment_id: Option<Uuid>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
