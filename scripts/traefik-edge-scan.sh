#!/usr/bin/env bash
#
# traefik-edge-scan.sh — Phase 33 (EDGE-API-01/02, EDGE-TLS-01/02/03; D-26..D-29) external edge scan.
#
# Laptop-only, read-only: local nmap (ssl-enum-ciphers + port sweep incl. 8080/8443), sslscan, curl -I and
# openssl against the public edge 188.166.23.244 and the 17 routed hostnames (D-27). Run it from OUTSIDE the
# swarm — micro sees every client as 10.0.0.2 and sits inside the edge. No third-party scanner is involved and
# nothing is logged anywhere but stdout.
#
# Prints header names, port states, cipher-suite names, HTTP codes and certificate serials only — never a
# response body, never a certificate body, never a credential.
#
# One `FAIL <check> <host>` line per missed D-28 predicate, report-only lines (`https`, `hsts`, `tls12`,
# `tls13`, `legacy`, `dashboard`, `redirect`, `serial`, `nosni-subject`) for the stricter observations
# (D-16 / D-20 are reported, not gating), then `EDGE-SCAN OK` or `EDGE-SCAN FAIL <n>` with exit 1.
#
# Usage: scripts/traefik-edge-scan.sh > <capture>
#        (the stdout is pasted into .planning/runbooks/swarm-configs/traefik-edge-scan.<YYYY-MM-DD>.md)
#
# A closed port or a refused handshake is a RESULT here, not a crash, so only -u is set.
#
# A missing or broken TOOL is a crash, never a pass (33-REVIEW CR-01): every tool a predicate relies on is
# checked before anything is scanned, and a missing one exits 2 (distinct from exit 1 = predicate failure)
# without printing a verdict. A tool or transport error during a gating predicate (empty port sweep, curl
# error, sslscan without a protocol table) is reported as a FAIL for that predicate, never skipped.
#
# Exit codes: 0 = EDGE-SCAN OK, 1 = EDGE-SCAN FAIL <n>, 2 = tooling preflight failed (nothing was scanned).

set -u

# CR-01 preflight: nmap (port sweep, ssl-enum-ciphers), sslscan (legacy protocols), curl (HTTP predicates),
# jq (api-exposed), nc (keep-7442), openssl (serial / no-SNI subject), plus the text tools the predicates pipe
# through. No DNS tool (dig/host) is used.
missing=""
for tool in nmap sslscan curl jq nc openssl grep sed awk sort tr paste head; do
  command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
done
# jq must also actually evaluate the api-exposed expression (a broken jq on PATH is as bad as none).
if [ -z "$missing" ] && ! printf '%s' '{"http":{}}' | jq -R -s -e '(try fromjson catch null) | if type=="object" then (.http != null) else false end' >/dev/null 2>&1; then
  missing="$missing jq(broken)"
fi
if [ -n "$missing" ]; then
  for tool in $missing; do echo "FAIL tool-missing $tool"; done
  echo "EDGE-SCAN PREFLIGHT FAIL: required tool(s) missing or broken on PATH:$missing — install them and rerun; no predicate was evaluated" >&2
  exit 2
fi

EDGE_IP=188.166.23.244
HOSTS="rtm.thinx.cloud app.thinx.cloud console.thinx.cloud thinx.cloud www.thinx.cloud swarmpit.thinx.cloud registry.thinx.cloud db.thinx.cloud influx.thinx.cloud www.fotostim.com www.fotostim.cz fotostim.com fotostim.cz igraczech.com www.igraczech.com www.syxra.cz micro.thinx.cloud"

# D-14 on RSA-4096 certificates: only the three ECDHE_RSA AEAD suites are ever observable (the ECDSA entries
# of D-14 can never be negotiated); nmap names ChaCha with the _SHA256 suffix (33-RESEARCH Pitfall 6).
WANT12="TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256"

# dashboard-401 exemption (33-01-PLAN amendment 5, D-06/D-28): the db/influx routers sit WHOLLY behind the
# couch-auth / influx-auth basic-auth middlewares and answer 401 on every path before and after Phase 33 —
# that 401 is the backend's auth, not a Traefik dashboard route (a Traefik basic-auth 401 carries the default
# realm on both, so the realm cannot discriminate a dashboard router from a protected backend). Exactly these
# two hosts, nothing else. api-exposed and dashboard-open still run on all 17 hosts, so an unauthenticated
# dashboard or API on db/influx would still fail the scan.
BASICAUTH_HOSTS="db.thinx.cloud influx.thinx.cloud"

# D-19 value, compared case-insensitively against the single Strict-Transport-Security header.
HSTS_WANT="max-age=31536000; includesubdomains; preload"

fail=0
want12_sorted=$(printf '%s\n' "$WANT12" | tr ' ' '\n' | sort -u | tr '\n' ' ' | sed 's/ $//')

echo "## Port sweep $EDGE_IP"
sweep_raw=$(nmap -Pn -p 80,443,8080,8443 "$EDGE_IP" 2>/dev/null)
sweep_rc=$?
sweep=$(printf '%s\n' "$sweep_raw" | grep -E '^[0-9]+/tcp')
printf '%s\n' "$sweep"
if [ "$sweep_rc" != "0" ]; then
  echo "FAIL port-sweep-error $EDGE_IP nmap rc=$sweep_rc"
  fail=$((fail + 1))
fi
# CR-01: every swept port must have a state line before port-open is evaluated — an empty or partial sweep
# would otherwise make the port-open predicate pass without having looked.
for port in 80 443 8080 8443; do
  if ! printf '%s\n' "$sweep" | grep -qE "^${port}/tcp"; then
    echo "FAIL port-sweep-missing $port"
    fail=$((fail + 1))
  fi
done
for port in 8080 8443; do
  if printf '%s\n' "$sweep" | grep -E "^${port}/tcp" | grep -q 'open'; then
    echo "FAIL port-open $port"
    fail=$((fail + 1))
  fi
done
# keep-7442 guard (AGENTS.md): the plaintext device port must stay reachable — gating.
if nc -z -w5 rtm.thinx.cloud 7442 >/dev/null 2>&1; then
  echo "port 7442 rtm.thinx.cloud open"
else
  echo "FAIL 7442-closed rtm.thinx.cloud"
  fail=$((fail + 1))
fi
# D-16 (reported): which certificate a no-SNI client receives.
nosni=$(echo | openssl s_client -connect "$EDGE_IP:443" -noservername 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | sed 's/^subject=//')
echo "nosni-subject ${nosni:-none}"

for H in $HOSTS; do
  echo "## $H"
  N=$(nmap -Pn --script ssl-enum-ciphers -p 443 "$H" 2>/dev/null)

  legacy=$(printf '%s\n' "$N" | grep -oE 'SSLv3:|TLSv1\.0:|TLSv1\.1:' | tr -d ':' | sort -u | paste -sd, -)
  if [ -n "$legacy" ]; then
    echo "FAIL legacy-tls $H $legacy"
    fail=$((fail + 1))
  fi

  if printf '%s\n' "$N" | grep -q 'TLSv1.3:'; then
    tls13=yes
  else
    tls13=no
    echo "FAIL no-tls13 $H"
    fail=$((fail + 1))
  fi

  got12=$(printf '%s\n' "$N" | sed -n '/TLSv1.2:/,/TLSv1.3:/p' | grep -oE 'TLS_[A-Z0-9_]+' | sort -u | tr '\n' ' ' | sed 's/ $//')
  if [ "$got12" != "$want12_sorted" ]; then
    echo "FAIL tls12-set $H got: ${got12:-none}"
    fail=$((fail + 1))
  fi

  ssl_out=$(sslscan --no-colour "$H" 2>/dev/null)
  # CR-01: no protocol table at all means sslscan did not scan — a FAIL for the predicate, not a pass.
  if ! printf '%s\n' "$ssl_out" | grep -qE '^(TLSv1\.2|TLSv1\.3) '; then
    echo "FAIL sslscan-legacy $H unchecked: no sslscan protocol table"
    fail=$((fail + 1))
  fi
  sslegacy=$(printf '%s\n' "$ssl_out" | grep -E '^(SSLv2|SSLv3|TLSv1\.0|TLSv1\.1) ' | grep -v disabled | awk '{print $1}' | paste -sd, -)
  if [ -n "$sslegacy" ]; then
    echo "FAIL sslscan-legacy $H $sslegacy"
    fail=$((fail + 1))
  fi

  # A curl error leaves $headers empty, so hsts fails closed (count 0 != 1); the curl rc is named on the line.
  headers_raw=$(curl -sSI -m 15 "https://$H/" 2>/dev/null)
  headers_rc=$?
  headers=$(printf '%s\n' "$headers_raw" | tr -d '\r')
  hsts_count=$(printf '%s\n' "$headers" | grep -ci '^strict-transport-security:')
  hsts_value=$(printf '%s\n' "$headers" | grep -i '^strict-transport-security:' | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr '[:upper:]' '[:lower:]')
  if [ "$hsts_count" = "1" ] && [ "$hsts_value" = "$HSTS_WANT" ]; then
    hsts=1
  else
    hsts=0
    if [ "$headers_rc" != "0" ]; then
      echo "FAIL hsts $H unchecked: curl rc=$headers_rc"
    else
      echo "FAIL hsts $H"
    fi
    fail=$((fail + 1))
  fi

  # D-06: no public Traefik API (JSON with .http) and no public dashboard HTML (APIUrl signature) anywhere.
  # CR-01: bodies are captured first; a curl error or a jq error is a FAIL for the predicate, not a skip.
  # jq reads the body as a raw string (-R -s), so a non-JSON body (404 text, HTML) is "not exposed" (rc 1),
  # JSON with a non-null .http is "exposed" (rc 0), and any other rc is a jq error.
  api_body=$(curl -s -m 15 "https://$H/api/overview" 2>/dev/null)
  api_curl_rc=$?
  if [ "$api_curl_rc" != "0" ]; then
    echo "FAIL api-exposed $H unchecked: curl rc=$api_curl_rc"
    fail=$((fail + 1))
  else
    printf '%s' "$api_body" | jq -R -s -e '(try fromjson catch null) | if type=="object" then (.http != null) else false end' >/dev/null 2>&1
    api_jq_rc=$?
    if [ "$api_jq_rc" = "0" ]; then
      echo "FAIL api-exposed $H"
      fail=$((fail + 1))
    elif [ "$api_jq_rc" != "1" ]; then
      echo "FAIL api-exposed $H unchecked: jq rc=$api_jq_rc"
      fail=$((fail + 1))
    fi
  fi
  dash_body=$(curl -s -m 15 "https://$H/dashboard/" 2>/dev/null)
  dash_curl_rc=$?
  dash_sig=$(printf '%s\n' "$dash_body" | grep -c APIUrl)
  if [ "$dash_curl_rc" != "0" ]; then
    echo "FAIL dashboard-open $H unchecked: curl rc=$dash_curl_rc"
    fail=$((fail + 1))
  elif [ "${dash_sig:-0}" != "0" ]; then
    echo "FAIL dashboard-open $H"
    fail=$((fail + 1))
  fi
  dash_code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 "https://$H/dashboard/" 2>/dev/null)
  dash_code_rc=$?
  case " $BASICAUTH_HOSTS " in
    *" $H "*) ;;
    *)
      if [ "$dash_code_rc" != "0" ]; then
        echo "FAIL dashboard-401 $H unchecked: curl rc=$dash_code_rc"
        fail=$((fail + 1))
      elif [ "$dash_code" = "401" ]; then
        echo "FAIL dashboard-401 $H"
        fail=$((fail + 1))
      fi
      ;;
  esac

  code=$(curl -sS -o /dev/null -m 15 -w '%{http_code}' "https://$H/" 2>/dev/null)
  redirect=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -m 15 "http://$H/" 2>/dev/null)
  serial=$(echo | openssl s_client -connect "$H:443" -servername "$H" 2>/dev/null | openssl x509 -noout -serial 2>/dev/null | sed 's/^serial=//')

  echo "https $H ${code:-000}"
  echo "hsts $H $hsts"
  echo "tls12 $H ${got12:-none}"
  echo "tls13 $H $tls13"
  echo "legacy $H ${legacy:-none}"
  echo "dashboard $H ${dash_code:-000} sig=${dash_sig:-0}"
  echo "redirect $H ${redirect:-000}"
  echo "serial $H ${serial:-none}"
done

if [ "$fail" = "0" ]; then
  echo "EDGE-SCAN OK"
else
  echo "EDGE-SCAN FAIL $fail"
  exit 1
fi
