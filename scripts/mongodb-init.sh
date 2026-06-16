#!/usr/bin/env bash
set -euo pipefail

echo "Waiting for MongoDB..."
until mongo --host mongodb:27017 --quiet --eval "db.adminCommand({ ping: 1 })" >/dev/null 2>&1; do
  sleep 2
done

echo "Initiating replica set if needed..."
mongo --host mongodb:27017 --quiet <<'EOF'
var status = rs.status();
if (status.ok === 1) {
  print("Replica set already initialized");
} else {
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongodb:27017" }] });
  print("Replica set initiated");
}
EOF
