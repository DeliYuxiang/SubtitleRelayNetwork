output "production_d1_id" {
  description = "Production D1 database ID — add as GitHub Secret SRN_D1_ID"
  value       = cloudflare_d1_database.production.id
}

output "production_d1_name" {
  description = "Production D1 database name — add as GitHub Secret SRN_D1_NAME"
  value       = cloudflare_d1_database.production.name
}

output "production_r2_name" {
  description = "Production R2 assets bucket name — add as GitHub Secret SRN_R2_NAME"
  value       = cloudflare_r2_bucket.production_assets.name
}

output "production_backup_r2_name" {
  description = "Production R2 backup bucket name — add as GitHub Secret SRN_BACKUP_R2_NAME"
  value       = cloudflare_r2_bucket.production_backup.name
}

output "preview_d1_id" {
  description = "Preview D1 database ID — add as GitHub Secret SRN_PREVIEW_D1_ID"
  value       = cloudflare_d1_database.preview.id
}

output "preview_d1_name" {
  description = "Preview D1 database name — add as GitHub Secret SRN_PREVIEW_D1_NAME"
  value       = cloudflare_d1_database.preview.name
}

output "preview_r2_name" {
  description = "Preview R2 bucket name — add as GitHub Secret SRN_PREVIEW_R2_NAME"
  value       = cloudflare_r2_bucket.preview_assets.name
}
