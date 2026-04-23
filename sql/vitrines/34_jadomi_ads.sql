-- =============================================================================
-- 34_jadomi_ads.sql
-- Migration: JADOMI Ads - Advertising Platform
-- Description: Complete schema for the JADOMI Ads system including campaigns,
--              creatives, impressions tracking, billing wallets, subscriptions,
--              audience segments, templates, and media library.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ALTER TABLE societes - Advertiser columns
-- ---------------------------------------------------------------------------

ALTER TABLE societes ADD COLUMN IF NOT EXISTS is_advertiser boolean DEFAULT false;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS is_formation_provider boolean DEFAULT false;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS advertiser_tier text DEFAULT NULL;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS advertiser_subscription_active boolean DEFAULT false;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS advertiser_activated_at timestamptz;

COMMENT ON COLUMN societes.is_advertiser IS 'Whether this company has activated JADOMI Ads';
COMMENT ON COLUMN societes.is_formation_provider IS 'Whether this company provides training/formation services';
COMMENT ON COLUMN societes.advertiser_tier IS 'Advertising tier: starter, pro, or enterprise';
COMMENT ON COLUMN societes.advertiser_subscription_active IS 'Whether the advertiser subscription is currently active';
COMMENT ON COLUMN societes.advertiser_activated_at IS 'Timestamp when the company first activated as an advertiser';

-- ---------------------------------------------------------------------------
-- 2. ad_campaigns - Core campaign management
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
    name text NOT NULL,
    objective text NOT NULL CHECK (objective IN ('awareness', 'traffic', 'conversions', 'leads', 'calls')),
    status text DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'active', 'paused', 'ended', 'rejected')),
    targeting_rules jsonb DEFAULT '{}',
    budget_type text DEFAULT 'daily' CHECK (budget_type IN ('daily', 'lifetime')),
    budget_amount numeric(10,2),
    budget_spent numeric(10,2) DEFAULT 0,
    budget_remaining numeric(10,2),
    bid_strategy text DEFAULT 'auto',
    bid_amount numeric(10,2),
    start_date timestamptz DEFAULT NOW(),
    end_date timestamptz,
    slot_types text[] DEFAULT ARRAY['banner','sidebar-card','native-feed'],
    quality_score numeric(3,2) DEFAULT 5.00,
    total_impressions bigint DEFAULT 0,
    total_clicks bigint DEFAULT 0,
    total_conversions int DEFAULT 0,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW(),
    reviewed_at timestamptz,
    reviewed_by uuid
);

COMMENT ON TABLE ad_campaigns IS 'JADOMI Ads campaigns created by advertisers';
COMMENT ON COLUMN ad_campaigns.objective IS 'Campaign goal: awareness, traffic, conversions, leads, or calls';
COMMENT ON COLUMN ad_campaigns.targeting_rules IS 'JSON targeting configuration (geo, demographics, interests, etc.)';
COMMENT ON COLUMN ad_campaigns.slot_types IS 'Ad placement slots this campaign can appear in';
COMMENT ON COLUMN ad_campaigns.quality_score IS 'Platform-computed quality score affecting ad ranking (0.00-9.99)';

-- ---------------------------------------------------------------------------
-- 3. ad_creatives - Creative assets for campaigns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_creatives (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    format text CHECK (format IN ('image', 'video', 'carousel')),
    r2_url text,
    thumbnail_url text,
    title text,
    description text,
    cta_text text,
    destination_url text,
    dimensions text,
    file_size_bytes int,
    ai_analysis jsonb,
    source text DEFAULT 'uploaded' CHECK (source IN ('uploaded', 'ai_generated', 'template', 'studio', 'imported_html')),
    source_metadata jsonb DEFAULT '{}',
    canvas_data jsonb,
    template_id text,
    ai_prompt text,
    video_metadata jsonb,
    status text DEFAULT 'active',
    created_at timestamptz DEFAULT NOW()
);

COMMENT ON TABLE ad_creatives IS 'Creative assets (images, videos, carousels) attached to ad campaigns';
COMMENT ON COLUMN ad_creatives.source IS 'How the creative was produced: uploaded, ai_generated, template, studio, or imported_html';
COMMENT ON COLUMN ad_creatives.canvas_data IS 'Studio canvas state for re-editing creatives';
COMMENT ON COLUMN ad_creatives.ai_analysis IS 'AI-generated analysis of the creative content (brand safety, quality)';

-- ---------------------------------------------------------------------------
-- 4. ad_impressions - Impression tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_impressions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    creative_id uuid REFERENCES ad_creatives(id) ON DELETE SET NULL,
    user_id uuid,
    slot_type text,
    page_url text,
    device_type text,
    geo_country text,
    geo_city text,
    cost numeric(10,4) DEFAULT 0,
    timestamp timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_impressions_campaign_id ON ad_impressions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_timestamp ON ad_impressions(timestamp);

COMMENT ON TABLE ad_impressions IS 'Records each ad impression served to a user';

-- ---------------------------------------------------------------------------
-- 5. ad_clicks - Click tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_clicks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    creative_id uuid REFERENCES ad_creatives(id) ON DELETE SET NULL,
    impression_id uuid REFERENCES ad_impressions(id) ON DELETE SET NULL,
    user_id uuid,
    destination_url text,
    device_type text,
    geo_country text,
    cost numeric(10,4) DEFAULT 0,
    timestamp timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_clicks_campaign_id ON ad_clicks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_timestamp ON ad_clicks(timestamp);

COMMENT ON TABLE ad_clicks IS 'Records each click on an ad creative';

-- ---------------------------------------------------------------------------
-- 6. ad_conversions - Conversion tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_conversions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    click_id uuid REFERENCES ad_clicks(id) ON DELETE SET NULL,
    user_id uuid,
    conversion_type text,
    conversion_value numeric(10,2) DEFAULT 0,
    metadata jsonb DEFAULT '{}',
    timestamp timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_conversions_campaign_id ON ad_conversions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_conversions_timestamp ON ad_conversions(timestamp);

COMMENT ON TABLE ad_conversions IS 'Tracks post-click conversions attributed to ad campaigns';

-- ---------------------------------------------------------------------------
-- 7. advertiser_wallets - Billing and balance management
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS advertiser_wallets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
    balance numeric(12,2) DEFAULT 0,
    total_deposited numeric(12,2) DEFAULT 0,
    total_spent numeric(12,2) DEFAULT 0,
    currency text DEFAULT 'EUR',
    auto_reload boolean DEFAULT false,
    auto_reload_amount numeric(10,2),
    auto_reload_threshold numeric(10,2),
    last_deposit_at timestamptz,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW(),
    CONSTRAINT uq_advertiser_wallets_advertiser_id UNIQUE (advertiser_id)
);

COMMENT ON TABLE advertiser_wallets IS 'Prepaid wallet for each advertiser to fund their campaigns';
COMMENT ON COLUMN advertiser_wallets.auto_reload IS 'Automatically top up wallet when balance falls below threshold';

-- ---------------------------------------------------------------------------
-- 8. advertiser_subscriptions - Subscription plan management
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS advertiser_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
    plan text NOT NULL CHECK (plan IN ('starter', 'pro', 'enterprise')),
    status text DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
    monthly_fee numeric(10,2) DEFAULT 0,
    included_budget numeric(10,2) DEFAULT 0,
    stripe_subscription_id text,
    current_period_start timestamptz,
    current_period_end timestamptz,
    cancel_at_period_end boolean DEFAULT false,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

COMMENT ON TABLE advertiser_subscriptions IS 'Tracks advertiser subscription plans (starter/pro/enterprise)';

-- ---------------------------------------------------------------------------
-- 9. audience_segments_saved - Reusable audience targeting segments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audience_segments_saved (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    segment_rules jsonb NOT NULL DEFAULT '{}',
    estimated_reach int,
    is_shared boolean DEFAULT false,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

COMMENT ON TABLE audience_segments_saved IS 'Saved audience segments that advertisers can reuse across campaigns';
COMMENT ON COLUMN audience_segments_saved.segment_rules IS 'JSON rules defining the audience (location, interests, demographics)';

-- ---------------------------------------------------------------------------
-- 10. ad_templates - Pre-built creative templates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_templates (
    id text PRIMARY KEY,
    category text,
    format text,
    style text,
    preview_url text,
    template_html text,
    variables jsonb,
    is_premium boolean DEFAULT false,
    usage_count int DEFAULT 0,
    created_at timestamptz DEFAULT NOW()
);

COMMENT ON TABLE ad_templates IS 'Library of pre-built creative templates for quick ad creation';
COMMENT ON COLUMN ad_templates.variables IS 'JSON schema of editable variables within the template';
COMMENT ON COLUMN ad_templates.is_premium IS 'Whether this template requires a pro/enterprise subscription';

-- ---------------------------------------------------------------------------
-- 11. ad_media_library - Uploaded media assets
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_media_library (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
    file_name text NOT NULL,
    r2_url text NOT NULL,
    thumbnail_url text,
    mime_type text,
    file_size_bytes int,
    dimensions text,
    duration_seconds numeric(8,2),
    tags text[] DEFAULT '{}',
    ai_labels jsonb,
    created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_media_library_advertiser_id ON ad_media_library(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_ad_media_library_created_at ON ad_media_library(created_at);

COMMENT ON TABLE ad_media_library IS 'Centralized media library for advertiser assets (images, videos)';
COMMENT ON COLUMN ad_media_library.ai_labels IS 'AI-generated labels and tags for the media asset';

-- ---------------------------------------------------------------------------
-- Reload PostgREST schema cache
-- ---------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
