use std::sync::OnceLock;
use std::time::Duration;

use axum::{
    body::Body,
    extract::Query,
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;

fn shared_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("failed to build reqwest client")
    })
}

#[derive(Deserialize)]
pub struct ProxyQuery {
    pub url: String,
}

fn bad_request(message: impl Into<String>) -> Response {
    (StatusCode::BAD_REQUEST, message.into()).into_response()
}

pub async fn proxy_get(Query(query): Query<ProxyQuery>) -> Response {
    let parsed = match reqwest::Url::parse(&query.url) {
        Ok(url) => url,
        Err(_) => return bad_request("invalid url"),
    };

    if parsed.scheme() != "https" {
        return bad_request("only https urls are allowed");
    }

    if parsed.host_str().is_none() {
        return bad_request("missing host in url");
    }

    let upstream = match shared_client()
        .get(parsed)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(error = %error, "proxy upstream request failed");
            return (StatusCode::BAD_GATEWAY, format!("upstream error: {error}")).into_response();
        }
    };

    let status = StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let content_type = upstream
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| HeaderValue::from_str(value).ok())
        .unwrap_or_else(|| HeaderValue::from_static("application/octet-stream"));

    let body_bytes = match upstream.bytes().await {
        Ok(bytes) => bytes,
        Err(error) => {
            tracing::warn!(error = %error, "proxy upstream body read failed");
            return (StatusCode::BAD_GATEWAY, format!("upstream body error: {error}")).into_response();
        }
    };

    let mut response = Response::new(Body::from(body_bytes));
    *response.status_mut() = status;
    response.headers_mut().insert(header::CONTENT_TYPE, content_type);
    response
}
