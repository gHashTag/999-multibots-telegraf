#!/bin/bash
set -e

# Create certificates directory if it doesn't exist
mkdir -p ./certs

# Generate self-signed certificate for development
echo "Generating self-signed SSL certificates for development..."

# Generate private key
openssl genrsa -out ./certs/key.pem 2048

# Generate self-signed certificate
openssl req -new -x509 -key ./certs/key.pem -out ./certs/cert.crt -days 365 -subj "/CN=localhost" \
    -addext "subjectAltName = DNS:localhost,IP:127.0.0.1"

# Set appropriate permissions
chmod 644 ./certs/cert.crt
chmod 600 ./certs/key.pem

echo "SSL certificates generated successfully!"
echo "  - Certificate: ./certs/cert.crt"
echo "  - Private key: ./certs/key.pem"
echo ""
echo "These certificates are for development purposes only."
echo "For production, use properly signed certificates."

