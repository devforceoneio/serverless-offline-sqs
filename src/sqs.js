const {
  SQSClient,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  DeleteMessageBatchCommand,
  CreateQueueCommand,
} = require('@aws-sdk/client-sqs');
const https = require('https');
const http = require('http');
const { parseString } = require('xml2js');

const {
  chunk,
  find,
  get,
  isPlainObject,
  mapValues,
  matches,
  pipe,
  toString,
  values,
} = require('lodash/fp');
const log = require('@serverless/utils/log').log;
const { default: PQueue } = require('p-queue');
const SQSEventDefinition = require('./sqs-event-definition');
const SQSEvent = require('./sqs-event');

const delay = (timeout) =>
  new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });

// Helper to make raw HTTP requests to ElasticMQ and parse XML responses
// ElasticMQ uses the SQS Query API format with XML responses
const elasticMqRequest = (endpoint, action, params = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const httpModule = url.protocol === 'https:' ? https : http;

    // Build query string for SQS Query API
    const queryParams = new URLSearchParams({
      Action: action,
      Version: '2012-11-05',
    });

    // Add parameters to query string (SQS Query API format)
    Object.keys(params).forEach((key) => {
      if (params[key] !== undefined && params[key] !== null) {
        queryParams.append(key, params[key]);
      }
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + '?' + queryParams.toString(),
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': 0,
      },
    };

    const req = httpModule.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        // Parse XML response
        parseString(
          data,
          { explicitArray: false, mergeAttrs: true },
          (err, result) => {
            if (err) {
              // If parsing fails, check if it's an error response
              if (data.includes('<ErrorResponse>')) {
                parseString(
                  data,
                  { explicitArray: false, mergeAttrs: true },
                  (parseErr, errorResult) => {
                    if (parseErr) {
                      reject(
                        new Error(
                          `ElasticMQ XML parse error: ${parseErr.message}`,
                        ),
                      );
                    } else {
                      const error = errorResult?.ErrorResponse?.Error || {};
                      const errorCode = error.Code || 'UnknownError';
                      const errorMessage = error.Message || 'Unknown error';
                      const sqsError = new Error(errorMessage);
                      sqsError.name = errorCode;
                      sqsError.code = errorCode;
                      reject(sqsError);
                    }
                  },
                );
              } else {
                reject(
                  new Error(
                    `Failed to parse ElasticMQ response: ${err.message}`,
                  ),
                );
              }
              return;
            }

            // Check for error response
            if (result.ErrorResponse) {
              const error = result.ErrorResponse.Error || {};
              const errorCode = error.Code || 'UnknownError';
              const errorMessage = error.Message || 'Unknown error';
              const sqsError = new Error(errorMessage);
              sqsError.name = errorCode;
              sqsError.code = errorCode;
              reject(sqsError);
              return;
            }

            // Return successful response
            resolve(result);
          },
        );
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
};

class SQS {
  constructor(lambda, resources, options) {
    this.lambda = null;
    this.resources = null;
    this.options = null;

    this.lambda = lambda;
    this.resources = resources;
    this.options = options;

    // Convert AWS SDK v2 options to v3 format
    const v3Config = {
      region: this.options.region,
      endpoint: this.options.endpoint,
      credentials: {
        accessKeyId: this.options.accessKeyId || 'root',
        secretAccessKey: this.options.secretAccessKey || 'root',
      },
    };
    this.client = new SQSClient(v3Config);

    this.queue = new PQueue({ autoStart: false });
  }

  create(events) {
    return Promise.all(
      events.map(({ functionKey, sqs }) => this._create(functionKey, sqs)),
    );
  }

  start() {
    this.queue.start();
  }

  stop(timeout) {
    this.queue.pause();
  }

  _create(functionKey, rawSqsEventDefinition) {
    const sqsEvent = new SQSEventDefinition(
      rawSqsEventDefinition,
      this.options.region,
      this.options.accountId,
    );

    return this._sqsEvent(functionKey, sqsEvent);
  }

  _rewriteQueueUrl(queueUrl) {
    if (!this.options.endpoint) return queueUrl;

    const { hostname, protocol, username, password, port } = new URL(
      this.options.endpoint,
    );
    const rewritedQueueUrl = new URL(queueUrl);
    rewritedQueueUrl.hostname = hostname;
    rewritedQueueUrl.protocol = protocol;
    rewritedQueueUrl.username = username;
    rewritedQueueUrl.password = password;
    rewritedQueueUrl.port = port;

    return rewritedQueueUrl.href;
  }

  async _getQueueUrl(queueName) {
    try {
      // For ElasticMQ, construct queue URL directly
      if (
        this.options.endpoint &&
        this.options.endpoint.includes('localhost:9324')
      ) {
        return { QueueUrl: `${this.options.endpoint}/queue/${queueName}` };
      }
      // For AWS SQS, use GetQueueUrlCommand
      const command = new GetQueueUrlCommand({ QueueName: queueName });
      return await this.client.send(command);
    } catch (err) {
      // If GetQueueUrlCommand fails and we have an endpoint, try direct construction
      if (this.options.endpoint) {
        return { QueueUrl: `${this.options.endpoint}/queue/${queueName}` };
      }
      await delay(10000);
      return this._getQueueUrl(queueName);
    }
  }

  async _sqsEvent(functionKey, sqsEvent) {
    const { enabled, arn, queueName, batchSize = 10 } = sqsEvent;

    if (!enabled) return;

    if (this.options.autoCreate) {
      await this._createQueue(sqsEvent);
      // Give ElasticMQ a moment to create the queue before trying to use it
      const isElasticMQ =
        this.options.endpoint &&
        this.options.endpoint.includes('localhost:9324');
      if (isElasticMQ) {
        await delay(1000);
      }
    }

    // For ElasticMQ, construct queue URL directly instead of using GetQueueUrlCommand
    // ElasticMQ queue URL format: http://localhost:9324/queue/{queueName}
    let QueueUrl;
    if (
      this.options.endpoint &&
      this.options.endpoint.includes('localhost:9324')
    ) {
      // ElasticMQ: construct URL directly
      QueueUrl = `${this.options.endpoint}/queue/${queueName}`;
    } else {
      // AWS SQS: use GetQueueUrlCommand
      try {
        const getQueueUrlCommand = new GetQueueUrlCommand({
          QueueName: queueName,
        });
        const getQueueUrlResult = await this.client.send(getQueueUrlCommand);
        QueueUrl = getQueueUrlResult.QueueUrl || '';
      } catch (err) {
        // Fallback: try constructing URL if GetQueueUrlCommand fails
        log.warning(
          `Failed to get queue URL for ${queueName}, trying direct URL construction: ${err.message}`,
        );
        if (this.options.endpoint) {
          QueueUrl = `${this.options.endpoint}/queue/${queueName}`;
        } else {
          throw err;
        }
      }
    }

    QueueUrl = this._rewriteQueueUrl(QueueUrl);

    const getMessages = async (size, messages = []) => {
      if (size <= 0) return messages;

      const isElasticMQ =
        this.options.endpoint &&
        this.options.endpoint.includes('localhost:9324');

      try {
        if (isElasticMQ) {
          // Use raw HTTP request for ElasticMQ to handle XML responses directly
          const queueNameFromUrl = QueueUrl.split('/').pop();
          const maxMessages = size > 10 ? 10 : size;

          // Use QueueUrl directly as endpoint for ElasticMQ (ElasticMQ supports this)
          const result = await elasticMqRequest(QueueUrl, 'ReceiveMessage', {
            MaxNumberOfMessages: maxMessages.toString(),
          });

          // Parse ElasticMQ XML response
          const receiveMessageResult = result.ReceiveMessageResponse || result;
          const messagesList =
            receiveMessageResult.ReceiveMessageResult?.Message;

          if (!messagesList) {
            return messages;
          }

          // Normalize message format (handle single message vs array)
          const normalizedMessages = Array.isArray(messagesList)
            ? messagesList
            : [messagesList];

          // Convert ElasticMQ XML format to AWS SDK format
          const awsFormatMessages = normalizedMessages.map((msg) => ({
            MessageId: msg.MessageId,
            ReceiptHandle: msg.ReceiptHandle,
            Body: msg.Body,
            Attributes: msg.Attribute || {},
            MessageAttributes: msg.MessageAttribute || {},
            MD5OfBody: msg.MD5OfBody,
          }));

          if (awsFormatMessages.length === 0) return messages;
          return getMessages(size - awsFormatMessages.length, [
            ...messages,
            ...awsFormatMessages,
          ]);
        } else {
          // Use AWS SDK for real AWS SQS
          const receiveMessageCommand = new ReceiveMessageCommand({
            QueueUrl,
            MaxNumberOfMessages: size > 10 ? 10 : size,
            AttributeNames: ['All'],
            MessageAttributeNames: ['All'],
            WaitTimeSeconds: 5,
          });
          const { Messages } = await this.client.send(receiveMessageCommand);

          if (!Messages || Messages.length === 0) return messages;
          return getMessages(size - Messages.length, [
            ...messages,
            ...Messages,
          ]);
        }
      } catch (err) {
        // Handle queue errors gracefully
        const isQueueError =
          err.name === 'AWS.SimpleQueueService.NonExistentQueue' ||
          err.name === 'NonExistentQueue' ||
          err.name === 'QueueDoesNotExist' ||
          err.code === 'AWS.SimpleQueueService.NonExistentQueue' ||
          err.code === 'NonExistentQueue';

        if (isQueueError) {
          log.warning(`Queue ${queueName} does not exist yet. Will retry.`);
          // Return empty messages and let the job retry later
          return messages;
        }

        // Re-throw other errors
        throw err;
      }
    };

    const isElasticMQ =
      this.options.endpoint && this.options.endpoint.includes('localhost:9324');

    const job = async () => {
      const messages = await getMessages(batchSize);

      if (messages.length > 0) {
        try {
          const lambdaFunction = this.lambda.get(functionKey);

          const event = new SQSEvent(messages, this.options.region, arn);
          lambdaFunction.setEvent(event);

          await lambdaFunction.runHandler();

          // Delete messages after processing
          try {
            if (isElasticMQ) {
              // Use raw HTTP for ElasticMQ to handle XML responses
              // Delete messages one by one (ElasticMQ DeleteMessageBatch might have issues)
              await Promise.all(
                (messages || []).map(async ({ ReceiptHandle }) => {
                  await elasticMqRequest(QueueUrl, 'DeleteMessage', {
                    ReceiptHandle: ReceiptHandle,
                  });
                }),
              );
            } else {
              // Use AWS SDK for real AWS SQS
              await Promise.all(
                chunk(
                  10,
                  (messages || []).map(({ MessageId: Id, ReceiptHandle }) => ({
                    Id,
                    ReceiptHandle,
                  })),
                ).map((Entries) => {
                  const deleteCommand = new DeleteMessageBatchCommand({
                    Entries,
                    QueueUrl,
                  });
                  return this.client.send(deleteCommand);
                }),
              );
            }
          } catch (deleteErr) {
            // Handle queue errors gracefully
            const isQueueError =
              deleteErr.name === 'AWS.SimpleQueueService.NonExistentQueue' ||
              deleteErr.name === 'NonExistentQueue' ||
              deleteErr.name === 'QueueDoesNotExist' ||
              deleteErr.code === 'AWS.SimpleQueueService.NonExistentQueue' ||
              deleteErr.code === 'NonExistentQueue';

            if (isQueueError) {
              log.warning(
                `Queue ${queueName} does not exist when deleting messages. Messages may not be deleted.`,
              );
            } else {
              // Re-throw other errors
              throw deleteErr;
            }
          }
        } catch (err) {
          log.warning(err.stack);
        }
      }

      this.queue.add(job);
    };
    this.queue.add(job);
  }

  _getResourceProperties(queueName) {
    return pipe(
      values,
      find(matches({ Properties: { QueueName: queueName } })),
      get('Properties'),
    )(this.resources);
  }

  async _createQueue({ queueName }, remainingTry = 5) {
    const isElasticMQ =
      this.options.endpoint && this.options.endpoint.includes('localhost:9324');

    try {
      const properties = this._getResourceProperties(queueName);

      if (isElasticMQ) {
        // Use raw HTTP request for ElasticMQ to handle XML responses directly
        const params = {
          QueueName: queueName,
        };

        // Add queue attributes if they exist
        if (properties) {
          Object.keys(properties).forEach((key, index) => {
            const value = properties[key];
            const attrValue = isPlainObject(value)
              ? JSON.stringify(value)
              : toString(value);
            params[`Attribute.${index + 1}.Name`] = key;
            params[`Attribute.${index + 1}.Value`] = attrValue;
          });
        }

        await elasticMqRequest(this.options.endpoint, 'CreateQueue', params);
        log.debug(`Created ElasticMQ queue: ${queueName}`);
      } else {
        // Use AWS SDK for real AWS SQS
        const createQueueCommand = new CreateQueueCommand({
          QueueName: queueName,
          Attributes: mapValues(
            (value) =>
              isPlainObject(value) ? JSON.stringify(value) : toString(value),
            properties,
          ),
        });
        await this.client.send(createQueueCommand);
      }
    } catch (err) {
      // Check for queue already exists error
      const isQueueExistsError =
        err.name === 'QueueAlreadyExists' ||
        err.name === 'AWS.SimpleQueueService.QueueAlreadyExists' ||
        err.name === 'QueueAlreadyExistsException' ||
        err.code === 'QueueAlreadyExists' ||
        err.code === 'AWS.SimpleQueueService.QueueAlreadyExists' ||
        (err.message &&
          (err.message.includes('already exists') ||
            err.message.includes('QueueAlreadyExists')));

      if (isQueueExistsError) {
        // Queue already exists, that's fine
        log.debug(`Queue ${queueName} already exists`);
        return;
      }

      // For other errors, retry if we have attempts left
      if (remainingTry > 0) {
        log.warning(
          `Failed to create queue ${queueName}, retrying... (${remainingTry} attempts left): ${err.message || err.name || 'Unknown error'}`,
        );
        await delay(1000);
        return this._createQueue({ queueName }, remainingTry - 1);
      }

      // Out of retries
      log.warning(
        `Failed to create queue ${queueName} after all retries: ${err.message || err.name || err.stack}`,
      );
    }
  }
}

module.exports = SQS;
