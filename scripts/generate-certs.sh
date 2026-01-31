#!/bin/bash

# Generate Self-Signed TLS Certificates for Development
#
# These certificates are for LOCAL DEVELOPMENT ONLY
# DO NOT use in production - use Let's Encrypt or a commercial CA

set -e

echo "🔐 Generating Self-Signed TLS Certificates"
echo "=========================================="
echo ""

# Create certs directory
CERTS_DIR="certs"
mkdir -p "$CERTS_DIR"

# Certificate details
CERT_DAYS=365
KEY_SIZE=4096
COUNTRY="US"
STATE="California"
CITY="San Francisco"
ORG="Development"
COMMON_NAME="localhost"

# File paths
KEY_FILE="$CERTS_DIR/localhost-key.pem"
CERT_FILE="$CERTS_DIR/localhost-cert.pem"
CSR_FILE="$CERTS_DIR/localhost-csr.pem"

echo "Creating self-signed certificate for: $COMMON_NAME"
echo "Valid for: $CERT_DAYS days"
echo ""

# Check if openssl is installed
if ! command -v openssl &> /dev/null; then
    echo "❌ Error: openssl is not installed"
    echo ""
    echo "Install openssl:"
    echo "  macOS:   brew install openssl"
    echo "  Ubuntu:  sudo apt-get install openssl"
    echo "  Windows: Download from https://slproweb.com/products/Win32OpenSSL.html"
    exit 1
fi

# Generate private key
echo "1. Generating private key..."
openssl genrsa -out "$KEY_FILE" $KEY_SIZE 2>/dev/null
chmod 600 "$KEY_FILE"
echo "   ✓ Private key: $KEY_FILE"

# Generate certificate signing request (CSR)
echo ""
echo "2. Generating certificate signing request..."
openssl req -new -key "$KEY_FILE" -out "$CSR_FILE" \
  -subj "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORG/CN=$COMMON_NAME" 2>/dev/null
echo "   ✓ CSR: $CSR_FILE"

# Generate self-signed certificate
echo ""
echo "3. Generating self-signed certificate..."
openssl x509 -req -days $CERT_DAYS -in "$CSR_FILE" \
  -signkey "$KEY_FILE" -out "$CERT_FILE" \
  -extfile <(printf "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1") 2>/dev/null
chmod 644 "$CERT_FILE"
echo "   ✓ Certificate: $CERT_FILE"

# Clean up CSR
rm "$CSR_FILE"

echo ""
echo "✅ Certificates generated successfully!"
echo ""
echo "📁 Certificate files:"
echo "   Private Key:  $KEY_FILE"
echo "   Certificate:  $CERT_FILE"
echo ""
echo "⚙️  Configuration:"
echo "   Add to your .env file:"
echo ""
echo "   SSL_KEY_PATH=./$KEY_FILE"
echo "   SSL_CERT_PATH=./$CERT_FILE"
echo ""
echo "🚀 Start server with HTTPS:"
echo "   npm start"
echo ""
echo "🌐 Access at:"
echo "   https://localhost:3000"
echo ""
echo "⚠️  Browser Warning:"
echo "   Your browser will show a security warning because this is a"
echo "   self-signed certificate. This is NORMAL for development."
echo ""
echo "   To bypass the warning:"
echo "   - Chrome/Edge: Click 'Advanced' → 'Proceed to localhost'"
echo "   - Firefox: Click 'Advanced' → 'Accept the Risk and Continue'"
echo "   - Safari: Click 'Show Details' → 'visit this website'"
echo ""
echo "📋 Certificate Details:"
openssl x509 -in "$CERT_FILE" -noout -text | grep -A 2 "Subject:"
openssl x509 -in "$CERT_FILE" -noout -dates
echo ""
echo "⚠️  IMPORTANT: These certificates are for DEVELOPMENT ONLY"
echo "   For production, use Let's Encrypt or a commercial Certificate Authority"
echo ""
