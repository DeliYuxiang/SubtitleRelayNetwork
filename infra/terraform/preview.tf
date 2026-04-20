resource "cloudflare_d1_database" "preview" {
  account_id = var.cloudflare_account_id
  name       = var.preview_d1_name
}

resource "cloudflare_r2_bucket" "preview_assets" {
  account_id = var.cloudflare_account_id
  name       = var.preview_r2_name
}
