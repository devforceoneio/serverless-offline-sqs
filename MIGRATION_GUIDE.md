# Migration Guide: Moving serverless-offline-sqs to Separate Repository

This guide walks you through moving the `serverless-offline-sqs` package to a new GitHub repository and using it in your project.

## Prerequisites

- GitHub account (devforceoneio)
- Git configured with SSH keys
- Access to the new repository

## Step 1: Create New GitHub Repository

1. Go to https://github.com/new
2. Repository name: `serverless-offline-sqs` (or your preferred name)
3. Description: "Serverless Framework plugin to emulate AWS SQS locally with ElasticMQ (AWS SDK v3 compatible)"
4. Visibility: Choose Public or Private
5. **DO NOT** initialize with README, .gitignore, or license (we'll add these)
6. Click "Create repository"

## Step 2: Prepare Package for New Repository

### 2.1 Update package.json

Update the repository information in `package.json`:

```json
{
  "name": "@devforceoneio/serverless-offline-sqs",
  "version": "8.1.0",
  "description": "Emulate AWS λ and SQS locally when developing your Serverless project (AWS SDK v3 compatible)",
  "main": "src",
  "private": false,
  "repository": {
    "type": "git",
    "url": "git@github.com:devforceoneio/serverless-offline-sqs.git"
  },
  "bugs": {
    "url": "https://github.com/devforceoneio/serverless-offline-sqs/issues"
  },
  "homepage": "https://github.com/devforceoneio/serverless-offline-sqs#readme",
  "author": "DevForceOne",
  "license": "MIT"
}
```

### 2.2 Create .gitignore

Create a `.gitignore` file in the package root:

```
node_modules/
.DS_Store
*.log
.env
.idea/
.vscode/
```

### 2.3 Update README.md

Update the README to reflect the new repository location and add installation instructions.

## Step 3: Initialize Git and Push to New Repository

```bash
# Navigate to the package directory
cd packages/serverless-offline-sqs

# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: AWS SDK v3 compatible serverless-offline-sqs plugin"

# Add remote repository (replace with your actual repo URL)
git remote add origin git@github.com:devforceoneio/serverless-offline-sqs.git

# Push to main branch
git branch -M main
git push -u origin main
```

## Step 4: Create Release Tag

```bash
# Create and push version tag
git tag -a v8.1.0 -m "Release version 8.1.0 - AWS SDK v3 compatible"
git push origin v8.1.0
```

## Step 5: Update This Project to Use the New Repository

### Option A: Using Git SSH (Recommended for Private Repos)

Update `packages/api/package.json`:

```json
{
  "devDependencies": {
    "@devforceoneio/serverless-offline-sqs": "git+ssh://git@github.com:devforceoneio/serverless-offline-sqs.git#v8.1.0"
  }
}
```

Or for latest main branch:

```json
{
  "devDependencies": {
    "@devforceoneio/serverless-offline-sqs": "git+ssh://git@github.com:devforceoneio/serverless-offline-sqs.git#main"
  }
}
```

### Option B: Using GitHub Packages (If Published to npm)

If you publish to npm (see Step 6):

```json
{
  "devDependencies": {
    "@devforceoneio/serverless-offline-sqs": "^8.1.0"
  }
}
```

### Option C: Using pnpm Workspace with Git (Alternative)

If you want to keep it as a workspace dependency but from git:

Update root `package.json` workspaces:

```json
{
  "workspaces": ["packages/*", "shared/*", "commands/*"]
}
```

Then in `packages/api/package.json`:

```json
{
  "devDependencies": {
    "@devforceoneio/serverless-offline-sqs": "git+ssh://git@github.com:devforceoneio/serverless-offline-sqs.git#v8.1.0"
  }
}
```

## Step 6: Install Dependencies

```bash
# From project root
cd /Users/thommo/DevForceOne/stryv

# Remove old workspace package
rm -rf packages/serverless-offline-sqs

# Install dependencies (this will fetch from git)
pnpm install
```

## Step 7: Update serverless.yml (If Package Name Changed)

If you changed the package name from `serverless-offline-sqs` to `@devforceoneio/serverless-offline-sqs`, update `packages/api/serverless.yml`:

```yaml
plugins:
  - serverless-esbuild
  - serverless-dynamodb
  - @devforceoneio/serverless-offline-sqs  # Update if name changed
  - serverless-offline
```

**Note:** Serverless Framework plugins are resolved by their package name, so if you change the name, you need to update the plugin list.

## Step 8: Verify Installation

```bash
# Start the API locally
cd packages/api
pnpm start

# Check that the plugin loads correctly
# You should see: "Starting Offline SQS at stage local (us-east-1)"
```

## Step 9: (Optional) Publish to npm

If you want to publish to npm for easier distribution:

### 9.1 Create npm Account (if needed)

```bash
npm login
```

### 9.2 Configure Package for Publishing

Update `package.json`:

```json
{
  "name": "@devforceoneio/serverless-offline-sqs",
  "publishConfig": {
    "access": "public"
  }
}
```

### 9.3 Publish

```bash
cd packages/serverless-offline-sqs
npm publish --access public
```

Then update `packages/api/package.json`:

```json
{
  "devDependencies": {
    "@devforceoneio/serverless-offline-sqs": "^8.1.0"
  }
}
```

## Troubleshooting

### Plugin Not Found

If Serverless Framework can't find the plugin:

1. Check the package name in `serverless.yml` matches the package name
2. Verify the package is installed: `ls node_modules/@devforceoneio/serverless-offline-sqs`
3. Check plugin is listed before `serverless-offline` in plugins array

### Git SSH Authentication

If you get authentication errors:

1. Verify SSH key is added to GitHub: `ssh -T git@github.com`
2. Use HTTPS instead: `git+https://github.com/devforceoneio/serverless-offline-sqs.git`

### Version Pinning

Always pin to a specific version tag for stability:

```json
"@devforceoneio/serverless-offline-sqs": "git+ssh://git@github.com:devforceoneio/serverless-offline-sqs.git#v8.1.0"
```

## Next Steps

1. Set up GitHub Actions for CI/CD (optional)
2. Add CONTRIBUTING.md if accepting contributions
3. Set up issue templates
4. Add LICENSE file (MIT recommended)
5. Create releases for each version
