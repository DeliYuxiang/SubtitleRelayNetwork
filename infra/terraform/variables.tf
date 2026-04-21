variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
  sensitive   = true
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token (needs D1 and R2 edit permissions)"
  type        = string
  sensitive   = true
}

variable "production_d1_name" {
  description = "Name for the production D1 database"
  type        = string
  default     = "srn-db-prod"
}

variable "production_r2_name" {
  description = "Name for the production R2 assets bucket"
  type        = string
  default     = "srn-assets-prod"
}

variable "production_backup_r2_name" {
  description = "Name for the production R2 backup bucket"
  type        = string
  default     = "srn-backup-prod"
}

variable "preview_d1_name" {
  description = "Name for the preview D1 database"
  type        = string
  default     = "srn-db-preview"
}

variable "preview_r2_name" {
  description = "Name for the preview R2 assets bucket"
  type        = string
  default     = "srn-assets-preview"
}

variable "b2_bucket_name" {
  description = "Name for the Backblaze B2 backup bucket"
  type        = string
  default     = "srn-backup-prod"
}

