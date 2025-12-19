-- Update existing default pipeline templates with comprehensive encoding config

UPDATE "PipelineTemplate"
SET "steps" = '[{
  "type":"SEARCH",
  "name":"Find Release",
  "config":{"minSeeds":5,"timeoutSeconds":300},
  "required":true,
  "retryable":true,
  "continueOnError":false,
  "children":[{
    "type":"DOWNLOAD",
    "name":"Download Source",
    "config":{"maxDownloadHours":24,"pollInterval":10000},
    "required":true,
    "retryable":true,
    "continueOnError":false,
    "children":[{
      "type":"ENCODE",
      "name":"Encode to AV1",
      "config":{
        "videoEncoder":"libsvtav1",
        "crf":28,
        "maxResolution":"1080p",
        "hwAccel":"NONE",
        "preset":"medium",
        "audioEncoder":"copy",
        "subtitlesMode":"COPY",
        "container":"MKV",
        "pollInterval":5000,
        "timeout":43200000
      },
      "required":true,
      "retryable":true,
      "continueOnError":false,
      "children":[{
        "type":"DELIVER",
        "name":"Deliver to Servers",
        "config":{"verifyDelivery":true},
        "required":true,
        "retryable":true,
        "continueOnError":false
      }]
    }]
  }]
}]'::jsonb
WHERE "id" = 'default-movie-pipeline';

UPDATE "PipelineTemplate"
SET "steps" = '[{
  "type":"SEARCH",
  "name":"Find Release",
  "config":{"minSeeds":3,"timeoutSeconds":300},
  "required":true,
  "retryable":true,
  "continueOnError":false,
  "children":[{
    "type":"DOWNLOAD",
    "name":"Download Source",
    "config":{"maxDownloadHours":24,"pollInterval":10000},
    "required":true,
    "retryable":true,
    "continueOnError":false,
    "children":[{
      "type":"ENCODE",
      "name":"Encode to AV1",
      "config":{
        "videoEncoder":"libsvtav1",
        "crf":28,
        "maxResolution":"1080p",
        "hwAccel":"NONE",
        "preset":"medium",
        "audioEncoder":"copy",
        "subtitlesMode":"COPY",
        "container":"MKV",
        "pollInterval":5000,
        "timeout":43200000
      },
      "required":true,
      "retryable":true,
      "continueOnError":false,
      "children":[{
        "type":"DELIVER",
        "name":"Deliver to Servers",
        "config":{"verifyDelivery":true},
        "required":true,
        "retryable":true,
        "continueOnError":false
      }]
    }]
  }]
}]'::jsonb
WHERE "id" = 'default-tv-pipeline';
