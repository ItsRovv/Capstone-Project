# Windsurf Rules / Skills

Place skill markdown files in this folder. Cascade automatically reads all `.md` files here and uses them as instructions.

## How to add GodMode skills

1. Clone the repo (you said you'll do this):
   ```bash
   git clone https://github.com/NoobyGains/godmode.git
   ```

2. Copy the skill files you want into this folder:
   ```bash
   cp godmode/skills/*.md .windsurf/rules/
   ```

3. Or create a symlink so updates auto-reflect:
   ```bash
   mklink /D "Lying-In Clinic Web App\.windsurf\rules\godmode" "path\to\godmode\skills"
   ```

## Priority

Windsurf reads rules in this order:
1. `.windsurf/rules/*.md` files (project-specific)
2. Global rules in Windsurf settings
3. Default behavior

Your project rules always override defaults.
