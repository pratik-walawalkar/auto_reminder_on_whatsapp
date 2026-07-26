-- ============================================================================
-- PROJECT: Headless WhatsApp Calendar & Contacts Automation System
-- LAYER: PostgreSQL Relational Database Schema Core
-- FILE: database_migrations/init_billing_tables.sql
-- AUTHOR: Systems Architecture Engineer (15+ Years Experience)
-- PURP: Establishes a highly resilient, continuous, audit-logged billing ledger.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: INITIALIZE TYPE DOMAINS AND EXTENSIONS
-- ----------------------------------------------------------------------------
-- Ensure data insertion models are strictly locked down to valid code paths
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'record_source') THEN
        CREATE TYPE record_source AS ENUM ('gmail_scan', 'pdf_dropzone', 'manual_form');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integrity_alert_type') THEN
        CREATE TYPE integrity_alert_type AS ENUM ('GAP_DETECTED', 'DUPLICATE_OVERLAP', 'KPI_ANOMALY');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- STEP 2: CREATE CONTINUOUS TIMELINE LEDGER TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS utility_billing_history (
    id SERIAL PRIMARY KEY,
    
    -- Ingestion Origin Telemetry Metadata
    msg_id VARCHAR(255) UNIQUE,                -- Gmail Message ID string identifier (NULL for manual/PDF entry)
    idempotency_hash VARCHAR(64) UNIQUE,       -- SHA256(provider + billing_start + billing_end) for manual entries
    provider_name VARCHAR(100) NOT NULL,       -- Explicit targets: 'Airtel WiFi', 'Adani Electricity', 'MGL Gas', 'Jio Recharge'
    
    -- Transaction Monetary Dimensions
    bill_amount NUMERIC(10, 2) NOT NULL CHECK (bill_amount >= 0.00),
    tax_amount NUMERIC(10, 2) DEFAULT 0.00 CHECK (tax_amount >= 0.00),
    due_date DATE NOT NULL,
    
    -- Timeline Continuity Invariants (Guards the dashboard visualization layer)
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    billing_year INT NOT NULL CHECK (billing_year >= 2020),
    billing_month INT NOT NULL CHECK (billing_month BETWEEN 1 AND 12),
    
    -- Consumption Key Performance Indicators (KPIs)
    units_consumed NUMERIC(10, 2) DEFAULT 0.00 CHECK (units_consumed >= 0.00), -- kWh for Electricity, SCM for Gas, GB for Telecom
    daily_average_usage NUMERIC(10, 2) DEFAULT 0.00 CHECK (daily_average_usage >= 0.00),
    
    -- Infrastructure Mappings & Local Workspace Pointers
    local_pdf_path VARCHAR(512),
    google_task_id VARCHAR(255),               -- Linked entry identifier synced with your Google Calendar side-panel
    
    -- Automated Worker Lifecycle & State Trackers
    data_source record_source DEFAULT 'gmail_scan',
    is_paid_status BOOLEAN DEFAULT FALSE,
    is_user_locked BOOLEAN DEFAULT FALSE,       -- TRUE if manually verified/updated via UI. Blocks scripts from overwriting changes!
    payment_success_date TIMESTAMP WITH TIME ZONE,
    
    -- Anti-Spam Notification Frequency Checklist Rules
    notified_received BOOLEAN DEFAULT FALSE,
    notified_seven_days BOOLEAN DEFAULT FALSE,
    notified_two_days BOOLEAN DEFAULT FALSE,
    
    -- System Audit Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- System-wide Constraint: No identical billing periods allowed for a single provider
    CONSTRAINT unique_provider_period UNIQUE (provider_name, billing_period_start, billing_period_end),
    
    -- System-wide Constraint: Ensure start dates always precede end dates chronologically
    CONSTRAINT logical_date_range CHECK (billing_period_start <= billing_period_end)
);

-- ----------------------------------------------------------------------------
-- STEP 3: CREATE INTEGRITY VERIFICATION AUDIT LOG TABLE
-- ----------------------------------------------------------------------------
-- Telemetry framework supplying logs directly to the dashboard's health indicator widget
CREATE TABLE IF NOT EXISTS data_integrity_alerts (
    id SERIAL PRIMARY KEY,
    provider_name VARCHAR(100) NOT NULL,
    alert_type integrity_alert_type NOT NULL,
    description TEXT NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- STEP 4: CREATE GLOBAL META-STATE CURSOR REGISTRY
-- ----------------------------------------------------------------------------
-- Tracks the exact date arrays until which the email account was scanned to preserve network efficiency
CREATE TABLE IF NOT EXISTS execution_metadata (
    meta_key VARCHAR(50) PRIMARY KEY,
    last_checkpoint TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- STEP 5: AUTOMATED TRIGGER FUNCTIONS FOR UPDATED_AT COLUMNS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp update triggers to database tables
DROP TRIGGER IF EXISTS tr_update_utility_billing_history ON utility_billing_history;
CREATE TRIGGER tr_update_utility_billing_history
    BEFORE UPDATE ON utility_billing_history
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS tr_update_data_integrity_alerts ON data_integrity_alerts;
CREATE TRIGGER tr_update_data_integrity_alerts
    BEFORE UPDATE ON data_integrity_alerts
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- ----------------------------------------------------------------------------
-- STEP 6: PERFORMANCE OPTIMIZATION INDEX MAPPING LAYOUT
-- ----------------------------------------------------------------------------
-- Ensures the future Next.js frontend load query lookups settle in milliseconds as data metrics grow
CREATE INDEX IF NOT EXISTS idx_billing_provider_date ON utility_billing_history(provider_name, billing_year, billing_month);
CREATE INDEX IF NOT EXISTS idx_billing_paid_status ON utility_billing_history(is_paid_status);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON data_integrity_alerts(resolved) WHERE resolved = FALSE;

-- ----------------------------------------------------------------------------
-- STEP 7: SEED BASELINE CONFIGURATION DATA
-- ----------------------------------------------------------------------------
-- Initialize the global background email timeline scanning execution checkpoints to year zero
INSERT INTO execution_metadata (meta_key, last_checkpoint)
VALUES ('gmail_scan_cursor', '1970-01-01 00:00:00+00')
ON CONFLICT (meta_key) DO NOTHING;
