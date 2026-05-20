#!/bin/bash
# =============================================================================
# TradeAI Pro - Database Backup Script
# =============================================================================
# Usage: ./backup.sh [--restore <backup-file> | --list | --clean]
#
# This script handles database backup operations:
#   1. Dump PostgreSQL database
#   2. Compress backup file (gzip)
#   3. Rotate old backups (keep last 7 days)
#   4. Optional: Upload to cloud storage (S3, GCS)
#
# Schedule with cron:
#   0 2 * * * /path/to/deployment/scripts/backup.sh >> /var/log/tradeai-backup.log 2>&1
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${DEPLOYMENT_DIR}/docker-compose.yml"
ENV_FILE="${DEPLOYMENT_DIR}/.env"
BACKUP_DIR="${DEPLOYMENT_DIR}/backups/postgres"
LOG_FILE="${DEPLOYMENT_DIR}/logs/backup-$(date +%Y%m%d).log"

# Backup settings
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
COMPRESSION="gzip"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="tradeai_backup_${TIMESTAMP}.sql"

# Database settings (defaults, overridden by .env)
POSTGRES_USER="${POSTGRES_USER:-trading_user}"
POSTGRES_DB="${POSTGRES_DB:-tradeai_pro}"

# Cloud storage settings (optional)
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
S3_ACCESS_KEY="${BACKUP_S3_ACCESS_KEY:-}"
S3_SECRET_KEY="${BACKUP_S3_SECRET_KEY:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1" | tee -a "$LOG_FILE"
}

die() {
    log_error "$1"
    exit 1
}

# ---------------------------------------------------------------------------
# Load Environment
# ---------------------------------------------------------------------------

load_env() {
    if [ -f "$ENV_FILE" ]; then
        set -a
        source <(grep -v '^#' "$ENV_FILE" | grep -v '^$' | sed 's/\r$//')
        set +a
        log_success "Environment loaded from $ENV_FILE"
    else
        log_warning "No .env file found. Using defaults."
    fi
}

# ---------------------------------------------------------------------------
# Backup Functions
# ---------------------------------------------------------------------------

check_prerequisites() {
    # Check docker compose is available
    if ! command -v docker >/dev/null 2>&1; then
        die "Docker is not installed."
    fi

    # Check postgres container is running
    if ! docker compose -f "$COMPOSE_FILE" ps postgres --status running -q 2>/dev/null | grep -q .; then
        die "PostgreSQL container is not running. Start services first."
    fi

    # Create backup directory
    mkdir -p "$BACKUP_DIR"
}

create_backup() {
    log_section "Creating Database Backup"
    log "Database: $POSTGRES_DB"
    log "User: $POSTGRES_USER"
    log "Backup file: ${BACKUP_FILE}"

    local sql_path="${BACKUP_DIR}/${BACKUP_FILE}"

    # Run pg_dump inside the postgres container
    log "Dumping database..."
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
        pg_dump \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        --format=plain \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        > "$sql_path" 2>>"$LOG_FILE"

    if [ ! -f "$sql_path" ] || [ ! -s "$sql_path" ]; then
        die "Backup failed: dump file is empty or missing."
    fi

    local sql_size
    sql_size=$(du -h "$sql_path" | cut -f1)
    log_success "Database dumped (${sql_size})"

    # Compress backup
    log "Compressing backup..."
    if command -v gzip >/dev/null 2>&1; then
        gzip -f "$sql_path"
        local compressed_file="${sql_path}.gz"
        local compressed_size
        compressed_size=$(du -h "$compressed_file" | cut -f1)
        log_success "Backup compressed: ${compressed_file} (${compressed_size})"
    else
        log_warning "gzip not found. Skipping compression."
        compressed_file="$sql_path"
    fi

    # Calculate checksum
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$compressed_file" > "${compressed_file}.sha256"
        log_success "Checksum saved: ${compressed_file}.sha256"
    fi

    return 0
}

rotate_backups() {
    log_section "Rotating Old Backups"

    local deleted_count=0

    # Find and delete backups older than RETENTION_DAYS
    while IFS= read -r -d '' old_backup; do
        rm -f "$old_backup" "${old_backup}.sha256" 2>/dev/null
        log_warning "Deleted old backup: $(basename "$old_backup")"
        deleted_count=$((deleted_count + 1))
    done < <(find "$BACKUP_DIR" -name "tradeai_backup_*.sql*" -type f -mtime "+${RETENTION_DAYS}" -print0 2>/dev/null)

    if [ "$deleted_count" -eq 0 ]; then
        log_success "No old backups to delete (retention: ${RETENTION_DAYS} days)"
    else
        log_success "Deleted ${deleted_count} old backup(s)"
    fi

    # List remaining backups
    local backup_count
    backup_count=$(find "$BACKUP_DIR" -name "tradeai_backup_*.sql*" -type f 2>/dev/null | wc -l)
    log "Remaining backups: ${backup_count}"
}

upload_to_cloud() {
    if [ -z "$S3_BUCKET" ]; then
        log_warning "Cloud storage (S3_BUCKET) not configured. Skipping upload."
        return 0
    fi

    log_section "Uploading to Cloud Storage"

    if ! command -v aws >/dev/null 2>&1; then
        log_warning "AWS CLI not installed. Skipping upload."
        return 0
    fi

    # Find the latest backup file
    local latest_backup
    latest_backup=$(find "$BACKUP_DIR" -name "tradeai_backup_*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)

    if [ -z "$latest_backup" ]; then
        log_warning "No backup file found to upload."
        return 0
    fi

    log "Uploading $(basename "$latest_backup") to s3://${S3_BUCKET}/backups/..."

    AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
    AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
    aws s3 cp "$latest_backup" "s3://${S3_BUCKET}/backups/trading/$(basename "$latest_backup")" \
        --storage-class STANDARD_IA 2>>"$LOG_FILE"

    log_success "Backup uploaded to cloud storage"
}

restore_backup() {
    local backup_file="$1"

    if [ -z "$backup_file" ]; then
        die "No backup file specified. Usage: $0 --restore <backup-file>"
    fi

    if [ ! -f "$backup_file" ]; then
        die "Backup file not found: $backup_file"
    fi

    log_section "Restoring from Backup"
    log_warning "⚠ WARNING: This will OVERWRITE the current database!"
    log_warning "Backup file: $backup_file"
    log_warning "Database: $POSTGRES_DB"

    # Confirm
    read -p "Are you sure you want to restore? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log "Restore cancelled."
        exit 0
    fi

    # Decompress if needed
    local restore_file="$backup_file"
    if [[ "$backup_file" == *.gz ]]; then
        log "Decompressing backup..."
        restore_file="${backup_file%.gz}"
        gunzip -c "$backup_file" > "$restore_file"
    fi

    # Restore database
    log "Restoring database (this may take a while)..."
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
        psql \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        < "$restore_file" 2>>"$LOG_FILE"

    if [ $? -eq 0 ]; then
        log_success "Database restored successfully"
    else
        log_error "Database restore failed!"
        exit 1
    fi

    # Cleanup temp file
    if [[ "$backup_file" == *.gz ]] && [ -f "$restore_file" ]; then
        rm -f "$restore_file"
    fi
}

list_backups() {
    log_section "Available Backups"

    if [ ! -d "$BACKUP_DIR" ]; then
        log "No backup directory found."
        return 0
    fi

    local backups
    backups=$(find "$BACKUP_DIR" -name "tradeai_backup_*.sql.gz" -type f -printf '%T+ %s %p\n' 2>/dev/null | sort -r)

    if [ -z "$backups" ]; then
        log "No backups found."
        return 0
    fi

    printf "%-30s %-12s %-40s\n" "DATE" "SIZE" "FILE"
    printf "%-30s %-12s %-40s\n" "------------------------------" "------------" "----------------------------------------"

    while IFS=' ' read -r date size file; do
        local size_human
        size_human=$(numfmt --to=iec "$size" 2>/dev/null || echo "$size")
        printf "%-30s %-12s %-40s\n" "$(basename "$file" | sed 's/tradeai_backup_//' | sed 's/.sql.gz//')" "$size_human" "$(basename "$file")"
    done <<< "$backups"

    echo ""
    local total_size
    total_size=$(du -sh "$BACKUP_DIR" | cut -f1)
    log "Total backup size: ${total_size}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
    mkdir -p "$(dirname "$LOG_FILE")"

    case "${1:-backup}" in
        backup)
            load_env
            check_prerequisites
            create_backup
            rotate_backups
            upload_to_cloud
            log_section "Backup Complete"
            log_success "Backup process finished successfully"
            ;;

        restore)
            load_env
            restore_backup "${2:-}"
            ;;

        list)
            list_backups
            ;;

        clean)
            load_env
            rotate_backups
            ;;

        *)
            echo "Usage: $0 {backup|restore <file>|list|clean}"
            echo ""
            echo "Commands:"
            echo "  backup              - Create a new database backup"
            echo "  restore <file>      - Restore database from backup file"
            echo "  list                - List all available backups"
            echo "  clean               - Remove backups older than retention period"
            exit 1
            ;;
    esac
}

main "$@"
