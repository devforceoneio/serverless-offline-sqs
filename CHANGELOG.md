# Changelog

## 8.1.0 - AWS SDK v3 Migration

### Changed
- **BREAKING**: Migrated from AWS SDK v2 to AWS SDK v3
  - Replaced `aws-sdk/clients/sqs` with `@aws-sdk/client-sqs`
  - Updated all SQS client operations to use AWS SDK v3 command pattern
  - Changed from `.promise()` pattern to `client.send(command)` pattern

### Technical Changes
- Updated `sqs.js` to use:
  - `SQSClient` instead of `SQS` from aws-sdk
  - `GetQueueUrlCommand`, `ReceiveMessageCommand`, `DeleteMessageBatchCommand`, `CreateQueueCommand`
  - Updated client configuration to use v3 format with explicit credentials
  - Fixed error handling for queue creation (AWS SDK v3 uses different error names)
  - Fixed region reference bug (changed `this.region` to `this.options.region`)

### Dependencies
- Removed: `aws-sdk@^2.1234.0`
- Added: `@aws-sdk/client-sqs@^3.940.0`

### Compatibility
- Compatible with ElasticMQ for local development
- Compatible with AWS SQS for production
- Maintains backward compatibility with existing serverless.yml configuration

