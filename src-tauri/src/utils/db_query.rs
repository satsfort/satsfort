use serde_json::Value as JsonValue;
use sqlx::Row;

pub fn bind_json_values<'q>(
    mut query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    values: &'q [JsonValue],
) -> Result<sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>, String> {
    for value in values {
        query = match value {
            JsonValue::String(text) => query.bind(text),
            JsonValue::Number(number) => {
                if let Some(int_val) = number.as_i64() {
                    query.bind(int_val)
                } else if let Some(float_val) = number.as_f64() {
                    query.bind(float_val)
                } else {
                    return Err("Unsupported numeric value".to_string());
                }
            }
            JsonValue::Bool(flag) => query.bind(*flag),
            JsonValue::Null => query.bind(None::<String>),
            JsonValue::Array(_) | JsonValue::Object(_) => {
                return Err("Only primitive JSON values are supported".to_string());
            }
        };
    }

    Ok(query)
}

pub fn decode_row_value(row: &sqlx::sqlite::SqliteRow, column_name: &str, db_type: &str) -> JsonValue {
    if db_type == "INTEGER" || db_type == "BIGINT" {
        if let Ok(value) = row.try_get::<i64, _>(column_name) {
            return JsonValue::from(value);
        }
    }

    if db_type == "REAL" {
        if let Ok(value) = row.try_get::<f64, _>(column_name) {
            return JsonValue::from(value);
        }
    }

    if db_type == "TEXT" {
        if let Ok(value) = row.try_get::<String, _>(column_name) {
            return JsonValue::from(value);
        }
    }

    if let Ok(value) = row.try_get::<String, _>(column_name) {
        return JsonValue::from(value);
    }
    if let Ok(value) = row.try_get::<i64, _>(column_name) {
        return JsonValue::from(value);
    }
    if let Ok(value) = row.try_get::<f64, _>(column_name) {
        return JsonValue::from(value);
    }
    if let Ok(value) = row.try_get::<bool, _>(column_name) {
        return JsonValue::from(value);
    }

    JsonValue::Null
}


