# AWS log forwarder

Lambda function to stream ec2 loadbalancer access logs and cloudwatch logs to impart inspector.

## Logstream ingestion configuration

1. Create a [Log Binding](https://console.impartsecurity.net/orgs/_/log-bindings).
   Specify grok pattern for the expected log format and file name which will be used in the inspector configuration in step 2. The following fields are supported and required to be resolved:

- timestamp - request timestamp, `HTTPDATE` and `TIMESTAMP_ISO8601` time formats are supported automatically. For custom time format provide layout in the grok: `%{GREEDYDATA:timestamp:ts-"2006-01-02 15:04:05.000"}`
- request - request url. Can include query string parameters if available
- response_code - response status code
- http_method - request http method

2. Run inspector with the following environment variables:

```
INSPECTOR_MODE: "log_stream_server"
INSPECTOR_LOGSTREAM_LISTEN_ADDR: ":<port>"
INSPECTOR_LOGSTREAM_LOG_FILE_NAME: "<log_binding_file_name>" # from step 1
INSPECTOR_API_ACCESS_TOKEN: "<access_token>" # setup here https://console.impartsecurity.net/orgs/_/integrations/inspector. Click `New inspector access token`
```

3. Run the lambda function subscribed either to cloud watch events or elb s3 events.
   Specify environment variable:

```
INSPECTOR_LOGSTREAM_LISTEN_ADDR: "<inspector_host>:<port>" # from step 2
```

### Grok Examples

For elb access logs:

```
%{TIMESTAMP_ISO8601:timestamp} %{NOTSPACE:loadbalancer} %{IP:client_ip}:%{NUMBER:client_port} (?:%{IP:backend_ip}:%{NUMBER:backend_port}|-) %{NUMBER:request_processing_time} %{NUMBER:backend_processing_time} %{NUMBER:response_processing_time} (?:%{NUMBER:response_code}|-) (?:%{NUMBER:backend_status_code}|-) %{NUMBER:received_bytes} %{NUMBER:sent_bytes} "(?:%{WORD:http_method}|-) (?:%{GREEDYDATA:request}|-) (?:HTTP/%{NUMBER:httpversion}|-( )?)" "%{DATA:userAgent}"( %{NOTSPACE:ssl_cipher} %{NOTSPACE:ssl_protocol})?
```

For api gateway cloudwatch access logs if the log format set to:

```
$context.requestTime "$context.httpMethod $context.path $context.protocol" $context.status $context.identity.sourceIp $context.requestId
```

```
%{HTTPDATE:timestamp} "(?:%{WORD:http_method}|-) (?:%{GREEDYDATA:request}|-) (?:HTTP/%{NUMBER:httpversion}|-( )?)" (?:%{NUMBER:response_code}|-)
```
