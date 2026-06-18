use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct CreateTaskRequest {
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub call_back_url: Option<String>,
    pub input: TaskInput,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_urls: Option<Vec<String>>,
    pub aspect_ratio: String,
    #[serde(default)]
    pub remove_watermark: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_frames: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateTaskResponse {
    pub code: i32,
    pub msg: String,
    pub data: Option<TaskData>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskData {
    pub task_id: Option<String>,
    pub video_url: Option<String>,
    pub result_urls: Option<Vec<String>>,
    pub success_flag: Option<i32>,
}

impl CreateTaskResponse {
    pub fn is_success(&self) -> bool {
        self.code == 200
    }

    pub fn task_id(&self) -> Option<&str> {
        self.data.as_ref().and_then(|d| d.task_id.as_deref())
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskStatusResponse {
    pub code: i32,
    pub msg: String,
    pub data: Option<TaskStatusData>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskStatusData {
    pub task_id: Option<String>,
    pub status: Option<String>,
    pub success_flag: Option<i32>,
    pub video_url: Option<String>,
    pub result_urls: Option<Vec<String>>,
    pub error_message: Option<String>,
    pub duration: Option<f64>,
}

impl TaskStatusData {
    pub fn is_completed(&self) -> bool {
        self.success_flag == Some(1)
    }

    pub fn is_failed(&self) -> bool {
        matches!(self.success_flag, Some(2) | Some(3))
    }

    pub fn first_video_url(&self) -> Option<String> {
        if let Some(url) = &self.video_url {
            return Some(url.clone());
        }
        self.result_urls
            .as_ref()
            .and_then(|urls| urls.first().cloned())
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WebhookPayload {
    pub task_id: Option<String>,
    pub success_flag: Option<i32>,
    pub result_urls: Option<Vec<String>>,
    pub result_water_mark_urls: Option<Vec<String>>,
    pub result_url: Option<String>,
    pub result_watermark_urls: Option<Vec<String>>,
    pub video_url: Option<String>,
    pub error_message: Option<String>,
    pub error_code: Option<String>,
    pub duration: Option<f64>,
    pub code: Option<i32>,
    pub data: Option<serde_json::Value>,
    pub response: Option<WebhookResponse>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WebhookResponse {
    pub result_urls: Option<Vec<String>>,
    pub result_url: Option<String>,
    pub error_message: Option<String>,
    pub duration: Option<f64>,
}

impl WebhookPayload {
    pub fn success_flag_val(&self) -> Option<i32> {
        self.success_flag.or_else(|| {
            self.data.as_ref().and_then(|d| d.get("successFlag").and_then(|v| v.as_i64()).map(|v| v as i32))
        })
    }

    pub fn is_completed(&self) -> bool {
        self.success_flag_val() == Some(1)
    }

    pub fn is_failed(&self) -> bool {
        matches!(self.success_flag_val(), Some(2) | Some(3))
    }

    pub fn first_video_url(&self) -> Option<String> {
        self.video_url
            .clone()
            .or_else(|| self.result_url.clone())
            .or_else(|| self.result_urls.as_ref().and_then(|u| u.first().cloned()))
            .or_else(|| {
                self.response
                    .as_ref()
                    .and_then(|r| r.result_url.clone().or_else(|| r.result_urls.as_ref().and_then(|u| u.first().cloned())))
            })
    }
}
