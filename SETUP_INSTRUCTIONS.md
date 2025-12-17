# Quick Setup Instructions

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `serverless-offline-sqs`
3. Description: "Serverless Framework plugin to emulate AWS SQS locally with ElasticMQ (AWS SDK v3 compatible)"
4. Visibility: Public or Private (your choice)
5. **DO NOT** initialize with README, .gitignore, or license
6. Click "Create repository"
7. Copy the repository URL (e.g., `git@github.com:devforceoneio/serverless-offline-sqs.git`)

## Step 2: Push Package to GitHub

Run these commands from the `packages/serverless-offline-sqs` directory:

```bash
cd packages/serverless-offline-sqs

# Initialize git (if not already done)
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: AWS SDK v3 compatible serverless-offline-sqs plugin v8.1.0"

# Add remote (replace with your actual repo URL)
git remote add origin git@github.com:devforceoneio/serverless-offline-sqs.git

# Push to main branch
git branch -M main
git push -u origin main

# Create and push version tag
git tag -a v8.1.0 -m "Release version 8.1.0 - AWS SDK v3 compatible"
git push origin v8.1.0
```

## Step 3: Update This Project

The package name is kept as `serverless-offline-sqs` so your `serverless.yml` doesn't need changes.

Update `packages/api/package.json`:

```json
{
  "devDependencies": {
    "serverless-offline-sqs": "git+ssh://git@github.com:devforceoneio/serverless-offline-sqs.git#v8.1.0"
  }
}
```

**Alternative:** If you prefer to use a scoped package name, change the package name in `package.json` to `@devforceoneio/serverless-offline-sqs` and update `serverless.yml` accordingly.

## Step 4: Remove Old Package and Install

```bash
# From project root
cd /Users/thommo/DevForceOne/stryv

# Remove old workspace package
rm -rf packages/serverless-offline-sqs

# Install dependencies
pnpm install
```

## Step 5: Verify

```bash
cd packages/api
pnpm start

# You should see: "Starting Offline SQS at stage local (us-east-1)"
```

## Troubleshooting

### Plugin Not Found

If you see "Plugin not found" errors:

1. Check the package name in `serverless.yml` matches the package name in `package.json`
2. Verify installation: `ls node_modules/serverless-offline-sqs` or `ls node_modules/@devforceoneio/serverless-offline-sqs`
3. Ensure plugin is listed **before** `serverless-offline` in the plugins array

### Git SSH Issues

If you get authentication errors:

1. Test SSH: `ssh -T git@github.com`
2. Use HTTPS instead: `git+https://github.com/devforceoneio/serverless-offline-sqs.git#v8.1.0`

### Version Updates

To update to a new version:

1. Make changes in the new repo
2. Create a new tag: `git tag -a v8.1.1 -m "Release v8.1.1" && git push origin v8.1.1`
3. Update `package.json`: `"serverless-offline-sqs": "git+ssh://git@github.com:devforceoneio/serverless-offline-sqs.git#v8.1.1"`
4. Run `pnpm install`

