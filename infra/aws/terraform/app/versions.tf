terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.46.0"
    }

    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.19.1"
    }

    random = {
      source  = "hashicorp/random"
      version = "3.9.0"
    }
  }
}
