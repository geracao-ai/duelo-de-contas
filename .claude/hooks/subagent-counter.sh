#!/bin/bash
# Conta os subagentes em execução por sessão, para a status line (.claude/statusline.sh).
# SubagentStart soma 1, SubagentStop tira 1; o valor fica em ~/.claude/run/<session_id>.agents.
input=$(cat)
sid=$(echo "$input" | jq -r '.session_id // empty')
event=$(echo "$input" | jq -r '.hook_event_name // empty')
[ -z "$sid" ] && exit 0

dir="$HOME/.claude/run"
file="$dir/$sid.agents"
mkdir -p "$dir"

(
  flock -x 9
  n=$(cat "$file" 2>/dev/null || echo 0)
  case "$event" in
    SubagentStart) n=$((n + 1)) ;;
    SubagentStop) n=$((n - 1)); [ "$n" -lt 0 ] && n=0 ;;
  esac
  echo "$n" > "$file"
) 9>"$file.lock"
exit 0
