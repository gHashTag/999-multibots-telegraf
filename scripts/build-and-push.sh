#!/bin/bash

# Docker Build and Push Automation Script
# Supports multiple registries and automatic versioning

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="999-agents-telegraf"
DOCKERFILE="Dockerfile.optimized"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[BUILD]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Parse command line arguments
PUSH_TO_REGISTRY=false
REGISTRY=""
FORCE_BUILD=false
BUILD_CACHE=true
PLATFORMS="linux/amd64"
TAG_LATEST=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH_TO_REGISTRY=true
            shift
            ;;
        --registry=*)
            REGISTRY="${1#*=}"
            shift
            ;;
        --force)
            FORCE_BUILD=true
            shift
            ;;
        --no-cache)
            BUILD_CACHE=false
            shift
            ;;
        --platforms=*)
            PLATFORMS="${1#*=}"
            shift
            ;;
        --latest)
            TAG_LATEST=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --push              Push image to registry"
            echo "  --registry=NAME     Registry to push to (ghcr.io, docker.io, etc.)"
            echo "  --force             Force rebuild without cache check"
            echo "  --no-cache          Build without Docker cache"
            echo "  --platforms=LIST    Target platforms (default: linux/amd64)"
            echo "  --latest            Tag as latest"
            echo "  --help              Show this help"
            echo ""
            echo "Examples:"
            echo "  $0                              # Build locally"
            echo "  $0 --push --registry=ghcr.io   # Build and push to GitHub Container Registry"
            echo "  $0 --force --no-cache          # Force clean rebuild"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Detect registry if pushing but not specified
if [ "$PUSH_TO_REGISTRY" = true ] && [ -z "$REGISTRY" ]; then
    if [ ! -z "$GITHUB_REPOSITORY" ]; then
        REGISTRY="ghcr.io"
        log "Auto-detected registry: $REGISTRY (GitHub Actions)"
    else
        REGISTRY="docker.io"
        warning "No registry specified, defaulting to: $REGISTRY"
    fi
fi

# Generate version tags
generate_version_tags() {
    local tags=()
    
    # Git-based versioning
    if command -v git &> /dev/null && git rev-parse --git-dir > /dev/null 2>&1; then
        local git_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
        local git_commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        local git_tag=$(git describe --tags --exact-match 2>/dev/null || echo "")
        
        # Add commit-based tag
        tags+=("${git_branch}-${git_commit}")
        
        # Add tag if on a tagged commit
        if [ ! -z "$git_tag" ]; then
            tags+=("$git_tag")
        fi
        
        # Add branch name for non-main branches
        if [ "$git_branch" != "main" ] && [ "$git_branch" != "master" ]; then
            tags+=("$git_branch")
        fi
    fi
    
    # Add timestamp-based tag
    tags+=("$(date +%Y%m%d-%H%M%S)")
    
    # Add latest tag if requested
    if [ "$TAG_LATEST" = true ]; then
        tags+=("latest")
    fi
    
    printf '%s\n' "${tags[@]}"
}

# Build image
build_image() {
    log "Starting Docker build process..."
    
    cd "$PROJECT_ROOT"
    
    # Verify Dockerfile exists
    if [ ! -f "$DOCKERFILE" ]; then
        error "Dockerfile not found: $DOCKERFILE"
    fi
    
    # Pre-build validation
    log "Running pre-build validation..."
    
    if [ ! -f "package.json" ]; then
        error "package.json not found"
    fi
    
    if [ ! -d "src" ]; then
        error "src directory not found"
    fi
    
    success "Pre-build validation passed"
    
    # Generate build args
    local build_args=(
        "--build-arg" "NODE_ENV=production"
        "--build-arg" "BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
        "--build-arg" "VCS_REF=$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
    )
    
    # Add cache options
    if [ "$BUILD_CACHE" = false ]; then
        build_args+=("--no-cache")
    fi
    
    # Build for each tag
    local tags=($(generate_version_tags))
    local primary_tag="${tags[0]}"
    local full_image_name
    
    if [ "$PUSH_TO_REGISTRY" = true ]; then
        if [ "$REGISTRY" = "ghcr.io" ]; then
            full_image_name="$REGISTRY/${GITHUB_REPOSITORY,,}/$IMAGE_NAME"
        else
            full_image_name="$REGISTRY/$IMAGE_NAME"
        fi
    else
        full_image_name="$IMAGE_NAME"
    fi
    
    log "Building image: $full_image_name:$primary_tag"
    log "Additional tags: ${tags[@]:1}"
    
    # Build primary image
    docker build \
        -f "$DOCKERFILE" \
        -t "$full_image_name:$primary_tag" \
        "${build_args[@]}" \
        .
    
    success "Image built successfully: $full_image_name:$primary_tag"
    
    # Tag additional versions
    for tag in "${tags[@]:1}"; do
        log "Tagging as: $full_image_name:$tag"
        docker tag "$full_image_name:$primary_tag" "$full_image_name:$tag"
    done
    
    # Store tags for push operation
    echo "${tags[@]}" > /tmp/docker_tags.txt
    echo "$full_image_name" > /tmp/docker_image_name.txt
}

# Push image to registry
push_image() {
    if [ "$PUSH_TO_REGISTRY" = false ]; then
        log "Skipping push (not requested)"
        return
    fi
    
    log "Pushing image to registry: $REGISTRY"
    
    local tags=($(cat /tmp/docker_tags.txt 2>/dev/null || echo "latest"))
    local full_image_name=$(cat /tmp/docker_image_name.txt 2>/dev/null || echo "$IMAGE_NAME")
    
    # Login to registry if credentials available
    if [ "$REGISTRY" = "ghcr.io" ] && [ ! -z "$GITHUB_TOKEN" ]; then
        echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
    elif [ ! -z "$DOCKER_PASSWORD" ] && [ ! -z "$DOCKER_USERNAME" ]; then
        echo "$DOCKER_PASSWORD" | docker login "$REGISTRY" -u "$DOCKER_USERNAME" --password-stdin
    fi
    
    # Push all tags
    for tag in "${tags[@]}"; do
        log "Pushing: $full_image_name:$tag"
        docker push "$full_image_name:$tag"
        success "Pushed: $full_image_name:$tag"
    done
    
    # Logout from registry
    docker logout "$REGISTRY" 2>/dev/null || true
    
    success "All images pushed successfully"
}

# Verify image
verify_image() {
    log "Verifying built image..."
    
    local full_image_name=$(cat /tmp/docker_image_name.txt 2>/dev/null || echo "$IMAGE_NAME")
    local primary_tag=$(cat /tmp/docker_tags.txt 2>/dev/null | awk '{print $1}' || echo "latest")
    
    # Check image exists
    if ! docker image inspect "$full_image_name:$primary_tag" > /dev/null 2>&1; then
        error "Image verification failed: image not found"
    fi
    
    # Check image size
    local image_size=$(docker image inspect "$full_image_name:$primary_tag" --format='{{.Size}}' | awk '{print int($1/1024/1024)}')
    log "Image size: ${image_size}MB"
    
    if [ "$image_size" -gt 2048 ]; then
        warning "Image size is large: ${image_size}MB"
    fi
    
    # Test container startup
    log "Testing container startup..."
    local test_container_id=$(docker run -d --name "test-$IMAGE_NAME-$$" "$full_image_name:$primary_tag" /bin/sh -c "sleep 30")
    
    sleep 5
    
    if docker ps --filter "id=$test_container_id" --filter "status=running" | grep -q "$test_container_id"; then
        success "Container startup test passed"
    else
        error "Container startup test failed"
    fi
    
    # Cleanup test container
    docker stop "$test_container_id" > /dev/null 2>&1 || true
    docker rm "$test_container_id" > /dev/null 2>&1 || true
    
    success "Image verification completed"
}

# Display summary
show_summary() {
    log "Build Summary"
    echo "=============="
    
    local full_image_name=$(cat /tmp/docker_image_name.txt 2>/dev/null || echo "$IMAGE_NAME")
    local tags=($(cat /tmp/docker_tags.txt 2>/dev/null || echo "latest"))
    
    echo "Image: $full_image_name"
    echo "Tags: ${tags[@]}"
    echo "Registry: ${REGISTRY:-"local"}"
    echo "Pushed: $([ "$PUSH_TO_REGISTRY" = true ] && echo "Yes" || echo "No")"
    echo "Platforms: $PLATFORMS"
    
    if [ "$PUSH_TO_REGISTRY" = true ]; then
        echo ""
        echo "Pull command:"
        echo "docker pull $full_image_name:${tags[0]}"
    fi
    
    echo ""
    echo "Run command:"
    echo "docker run -d --name 999-multibots \\"
    echo "  --env-file .env \\"
    echo "  -p 2999:2999 -p 3000:3000 -p 3001-3010:3001-3010 \\"
    echo "  $full_image_name:${tags[0]}"
}

# Cleanup
cleanup() {
    rm -f /tmp/docker_tags.txt /tmp/docker_image_name.txt
}

# Main execution
main() {
    log "🚀 Docker Build and Push Automation"
    log "===================================="
    
    # Set trap for cleanup
    trap cleanup EXIT
    
    build_image
    verify_image
    push_image
    show_summary
    
    success "🎉 Build process completed successfully!"
}

# Run main function
main "$@"