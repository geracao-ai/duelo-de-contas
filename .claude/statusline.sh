#!/bin/bash
# Status line: user@host pasta (branch) | Modelo | ctx NN% | cost | duration | 5h/7d limits | cache
input=$(cat)

cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')
model=$(echo "$input" | jq -r '.model.display_name // empty')
ctx=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
five=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
week=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
observed=$(echo "$input" | jq -r '.prompt_cache.caching_observed // empty')
warm=$(echo "$input" | jq -r '.prompt_cache.warm // empty')
expires=$(echo "$input" | jq -r '.prompt_cache.expires_at // empty')
hit=$(echo "$input" | jq -r '.prompt_cache.hit_ratio // empty')

cost=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
dur_ms=$(echo "$input" | jq -r '.cost.total_duration_ms // 0')

dir=$(basename "${cwd:-$PWD}")
branch=$(git -C "${cwd:-$PWD}" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null \
  || git -C "${cwd:-$PWD}" --no-optional-locks rev-parse --short HEAD 2>/dev/null)

# color by percentage: green < 50, yellow < 80, red otherwise
color() {
  local p=${1%.*}
  if [ "$p" -ge 80 ]; then printf '\033[31m'
  elif [ "$p" -ge 50 ]; then printf '\033[33m'
  else printf '\033[32m'; fi
}
RST='\033[0m'

# left part
printf '\033[32m%s@%s\033[0m \033[34m%s\033[0m' "$(whoami)" "$(hostname -s)" "$dir"
[ -n "$branch" ] && printf ' \033[35m(%s)\033[0m' "$branch"
[ -n "$model" ] && printf ' | \033[36m%s\033[0m' "$model"
if [ -n "$ctx" ]; then
  printf ' | ctx %s%.0f%%%b' "$(color "$ctx")" "$ctx" "$RST"
fi

# cost and duration
printf ' | 💰 $%.2f' "${cost:-0}"
total_secs=$(( ${dur_ms%.*} / 1000 ))
printf ' | ⏱️ %dm %ds' $((total_secs / 60)) $((total_secs % 60))

# limits and cache
printf ' | '
sep=""
if [ -n "$five" ]; then
  printf '5h: %s%.0f%%%b' "$(color "$five")" "$five" "$RST"; sep=" "
fi
if [ -n "$week" ]; then
  printf '%s7d: %s%.0f%%%b' "$sep" "$(color "$week")" "$week" "$RST"; sep=" "
fi
[ -z "$sep" ] && printf 'limites: n/d'

printf ' | '
if [ "$observed" = "true" ]; then
  if [ "$warm" = "true" ]; then
    left=""
    if [ -n "$expires" ]; then
      secs=$(( ${expires%.*} - $(date +%s) ))
      [ "$secs" -lt 0 ] && secs=0
      left=" $((secs / 60))m$(printf '%02d' $((secs % 60)))s"
    fi
    printf '\033[32mcache quente%s\033[0m' "$left"
  else
    printf '\033[31mcache frio\033[0m'
  fi
  [ -n "$hit" ] && printf ' (hit %.0f%%)' "$(echo "$hit * 100" | bc -l)"
else
  printf 'cache n/d'
fi

# running subagents (counter maintained by hooks in subagent-counter.sh)
sid=$(echo "$input" | jq -r '.session_id // empty')
agents=$(cat "$HOME/.claude/run/$sid.agents" 2>/dev/null)
printf ' | 🤖 %s agents' "${agents:-0}"
printf '\n'
