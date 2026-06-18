use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub enum BotName {
    NeuroBloggerBot,
    MetaMuseManifestBot,
    ZavaraBot,
    LeeSolarBot,
    NeuroLenaAssistantBot,
    NeurostylistShtogrinaBot,
    GaiaKamskaiaBot,
    AiKosheyBot,
    ClipMakerNeuroBot,
    Helper999Bot,
    KayaEasyArtBot,
    AiStarsBot,
    TestNeurocoderBot,
    HaimGroupMediaBot,
    OmAiDigitalStudioBot,
}

impl BotName {
    pub fn token_env_var(&self) -> String {
        format!(
            "BOT_TOKEN_{}",
            match self {
                Self::NeuroBloggerBot => 1,
                Self::MetaMuseManifestBot => 2,
                Self::ZavaraBot => 3,
                Self::LeeSolarBot => 4,
                Self::NeuroLenaAssistantBot => 5,
                Self::NeurostylistShtogrinaBot => 6,
                Self::GaiaKamskaiaBot => 7,
                Self::AiKosheyBot => 8,
                Self::ClipMakerNeuroBot => 9,
                Self::Helper999Bot => 10,
                Self::KayaEasyArtBot => 11,
                Self::AiStarsBot => 12,
                Self::TestNeurocoderBot => 13,
                Self::HaimGroupMediaBot => 14,
                Self::OmAiDigitalStudioBot => 15,
            }
        )
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::NeuroBloggerBot => "Neuro Blogger",
            Self::MetaMuseManifestBot => "MetaMuse Manifest",
            Self::ZavaraBot => "Zavara",
            Self::LeeSolarBot => "Lee Solar",
            Self::NeuroLenaAssistantBot => "Neuro Lena",
            Self::NeurostylistShtogrinaBot => "Neurostylist Shtogrina",
            Self::GaiaKamskaiaBot => "Gaia Kamskaia",
            Self::AiKosheyBot => "AI Koshey",
            Self::ClipMakerNeuroBot => "Clip Maker Neuro",
            Self::Helper999Bot => "Helper 999",
            Self::KayaEasyArtBot => "Kaya Easy Art",
            Self::AiStarsBot => "AI STARS",
            Self::TestNeurocoderBot => "Test Neurocoder",
            Self::HaimGroupMediaBot => "Haim Group Media",
            Self::OmAiDigitalStudioBot => "OM AI Digital Studio",
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BotConfig {
    pub name: BotName,
    pub token: String,
    pub is_production: bool,
}

impl std::fmt::Debug for BotConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BotConfig")
            .field("name", &self.name)
            .field("token", &"<redacted>")
            .field("is_production", &self.is_production)
            .finish()
    }
}
