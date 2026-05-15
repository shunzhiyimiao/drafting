//! High-level entry point: takes a TaskId + chat messages, resolves the route,
//! finds the adapter, opens the stream, and drives it through StreamManager.

use std::path::Path;
use std::sync::Arc;

use super::adapters::anthropic::AnthropicAdapter;
use super::adapters::ollama::OllamaAdapter;
use super::adapters::openai::OpenAiAdapter;
use super::adapters::{ProviderAdapter, ProviderContext};
use super::config;
use super::stream::StreamManager;
use super::types::{ChatRequest, Profile, Protocol, StreamEvent, TaskId};
use crate::sync_bus::events::{AiProviderEvent, SyncBusEvent};
use crate::sync_bus::types::Origin;
use crate::sync_bus::SyncBus;

pub struct AiRunner {
    pub stream_manager: Arc<StreamManager>,
}

impl AiRunner {
    pub fn new() -> Self {
        Self {
            stream_manager: Arc::new(StreamManager::new()),
        }
    }

    /// Resolve TaskId → (Profile, model). Errors out clearly if the route
    /// points at a deleted/disabled profile.
    pub fn resolve_route(
        &self,
        project_root: &Path,
        task_id: &TaskId,
    ) -> Result<(Profile, String), String> {
        let cfg = config::load_config(project_root);
        if !cfg.global_enabled {
            return Err("Global AI is disabled".into());
        }
        let route = cfg
            .routes
            .iter()
            .find(|r| &r.task_id == task_id)
            .ok_or_else(|| format!("No route configured for task {task_id:?}"))?;

        let profile = cfg
            .profiles
            .iter()
            .find(|p| p.id == route.profile_id)
            .cloned()
            .ok_or_else(|| {
                format!(
                    "Route for {task_id:?} points at profile '{}' which no longer exists",
                    route.profile_id
                )
            })?;

        if !profile.enabled {
            return Err(format!(
                "Profile '{}' is disabled — enable it in Settings",
                profile.name
            ));
        }
        Ok((profile, route.model.clone()))
    }

    fn build_context(
        &self,
        project_root: &Path,
        profile: &Profile,
    ) -> Result<ProviderContext, String> {
        let api_key =
            config::get_api_key_for_profile(project_root, &profile.id).unwrap_or_default();

        let endpoint_path = if profile.endpoint_path.is_empty() {
            profile.protocol.default_endpoint_path().to_string()
        } else {
            profile.endpoint_path.clone()
        };

        Ok(ProviderContext {
            base_url: profile.base_url.clone(),
            endpoint_path,
            api_key,
            auth_scheme: profile.auth_scheme.clone(),
            extra_headers: profile.extra_headers.clone(),
        })
    }

    fn pick_adapter(&self, protocol: Protocol) -> Box<dyn ProviderAdapter> {
        match protocol {
            Protocol::Anthropic => Box::new(AnthropicAdapter),
            Protocol::OpenaiCompatible => Box::new(OpenAiAdapter),
            Protocol::Ollama => Box::new(OllamaAdapter),
        }
    }

    /// Run a streaming chat for the given task. Returns the assigned stream_id.
    /// Events are delivered to `on_event` (typically a Tauri emitter).
    pub async fn run_task<F>(
        &self,
        project_root: &Path,
        task_id: TaskId,
        request: ChatRequest,
        sync_bus: SyncBus,
        on_event: F,
    ) -> Result<String, String>
    where
        F: FnMut(StreamEvent) + Send + 'static,
    {
        let (profile, default_model) = self.resolve_route(project_root, &task_id)?;
        let model = if request.model.is_empty() {
            default_model
        } else {
            request.model.clone()
        };

        let mut req = request;
        req.model = model.clone();

        let ctx = self.build_context(project_root, &profile)?;
        let adapter = self.pick_adapter(profile.protocol);

        let stream_id = uuid::Uuid::new_v4().to_string();
        let profile_id_for_event = profile.id.clone();
        let task_label = format!("{:?}", task_id);

        // Open the upstream stream first so we report errors synchronously.
        let inner = adapter.stream_chat(&ctx, stream_id.clone(), req).await?;

        // Sync Bus: stream started.
        sync_bus.publish(
            Origin::new("ai_provider"),
            SyncBusEvent::AiProvider(AiProviderEvent::StreamStarted {
                stream_id: stream_id.clone(),
                task: task_label.clone(),
                provider: profile.name.clone(),
                model: model.clone(),
            }),
        );

        // Wrap on_event so we both forward to the caller and republish terminal
        // events on the Sync Bus.
        let stream_id_for_cb = stream_id.clone();
        let bus_for_cb = sync_bus.clone();
        let mut on_event = on_event;
        let wrapped = move |ev: StreamEvent| {
            match &ev {
                StreamEvent::Completed {
                    input_tokens,
                    output_tokens,
                    ..
                } => {
                    bus_for_cb.publish(
                        Origin::new("ai_provider"),
                        SyncBusEvent::AiProvider(AiProviderEvent::StreamCompleted {
                            stream_id: stream_id_for_cb.clone(),
                            input_tokens: *input_tokens,
                            output_tokens: *output_tokens,
                            cost_usd: 0.0,
                        }),
                    );
                }
                StreamEvent::Cancelled { .. } => {
                    bus_for_cb.publish(
                        Origin::new("ai_provider"),
                        SyncBusEvent::AiProvider(AiProviderEvent::StreamCancelled {
                            stream_id: stream_id_for_cb.clone(),
                        }),
                    );
                }
                StreamEvent::Failed { error, .. } => {
                    bus_for_cb.publish(
                        Origin::new("ai_provider"),
                        SyncBusEvent::AiProvider(AiProviderEvent::StreamFailed {
                            stream_id: stream_id_for_cb.clone(),
                            error: error.clone(),
                        }),
                    );
                }
                _ => {}
            }
            on_event(ev);
        };

        let mut wrapped = wrapped;
        wrapped(StreamEvent::Started {
            stream_id: stream_id.clone(),
            profile_id: profile_id_for_event,
            model,
        });

        let mgr = self.stream_manager.clone();
        let sid = stream_id.clone();
        tokio::spawn(async move {
            mgr.run(sid, inner, wrapped).await;
        });

        Ok(stream_id)
    }

    pub async fn cancel(&self, stream_id: &str) -> bool {
        self.stream_manager.cancel(stream_id).await
    }

    /// Health check by Profile. Used by the Settings "Test connection" button.
    pub async fn health_check_profile(
        &self,
        project_root: &Path,
        profile_id: &str,
    ) -> Result<(), String> {
        let cfg = config::load_config(project_root);
        let profile = cfg
            .profiles
            .iter()
            .find(|p| p.id == profile_id)
            .ok_or_else(|| format!("profile {profile_id} not found"))?;
        let ctx = self.build_context(project_root, profile)?;
        let adapter = self.pick_adapter(profile.protocol);
        adapter.health_check(&ctx).await
    }

    /// Ad-hoc health check from a draft profile (used when the user is filling
    /// out the new-profile form and hasn't saved yet).
    pub async fn health_check_draft(
        &self,
        project_root: &Path,
        draft: Profile,
        api_key: Option<String>,
    ) -> Result<(), String> {
        let endpoint_path = if draft.endpoint_path.is_empty() {
            draft.protocol.default_endpoint_path().to_string()
        } else {
            draft.endpoint_path.clone()
        };
        let key = api_key
            .or_else(|| config::get_api_key_for_profile(project_root, &draft.id))
            .unwrap_or_default();
        let ctx = ProviderContext {
            base_url: draft.base_url.clone(),
            endpoint_path,
            api_key: key,
            auth_scheme: draft.auth_scheme.clone(),
            extra_headers: draft.extra_headers.clone(),
        };
        let adapter = self.pick_adapter(draft.protocol);
        adapter.health_check(&ctx).await
    }
}
