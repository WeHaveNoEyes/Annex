# Encoding Architecture Analysis

## Current State

### Components

1. **EncodingProfile** (Database Model)
   - Comprehensive encoder settings stored in database
   - Fields: videoEncoder, videoQuality, videoMaxResolution, videoMaxBitrate, hwAccel, hwDevice, videoFlags, audioEncoder, audioFlags, subtitlesMode, container
   - Can be set as default for StorageServer
   - Managed in Settings UI

2. **StorageServer.encodingProfileId**
   - Each server can have a default encoding profile
   - Used if user doesn't specify a profile when making request

3. **MediaRequest.targets**
   - JSON array: `[{serverId, encodingProfileId?}]`
   - User can override server default by selecting specific profile per server
   - Selected in RequestDialog UI

4. **Pipeline Encode Step Config**
   - Simple quality settings: `crf`, `maxResolution`, `preset`
   - Defined in PipelineTemplate encode step
   - Currently in default pipelines

### Current Flow

1. User configures EncodingProfiles in Settings → Encoding
2. User assigns default profile to StorageServers in Settings → Storage
3. User makes request:
   - Selects target servers
   - Optionally selects specific encoding profiles (or uses server defaults)
   - Selects pipeline template (with encode step config)
4. EncodeStep executes:
   - Gets `profileId` from `context.targets[0].encodingProfileId`
   - **REQUIRES** a profileId (errors if missing)
   - Creates job with BOTH profileId AND step config (crf, maxResolution, preset)
5. EncoderDispatch assigns job:
   - Fetches EncodingProfile from database
   - Sends **only the profile** to remote encoder
   - **Step config overrides are IGNORED** - never sent to encoder

### The Problem

**The pipeline encode step config is stored but never used.**

- Step config (crf, maxResolution, preset) goes into job payload
- Job assignment sends only the EncodingProfile to encoder
- Step config is not merged, applied, or referenced anywhere

**Result: Confusion and redundancy**
- Users must configure encoding profiles
- Users must select profiles when making requests
- Pipeline encode step config appears to do something but doesn't
- No clear guidance on which settings take precedence

## Architecture Options

### Option A: Remove Pipeline Encode Config, Keep EncodingProfiles

**Changes:**
- Remove `crf`, `maxResolution`, `preset` from pipeline encode step config
- Keep encode step minimal: `{pollInterval?, timeout?}`
- Keep all encoding configuration in EncodingProfile model
- Keep profile selection in RequestDialog

**Pros:**
- Simpler mental model: encoding config lives in one place
- Profiles are reusable across requests and pipelines
- Server defaults work well
- No confusion about precedence

**Cons:**
- Less flexibility for per-pipeline customization
- Changing encoding settings requires Settings UI, can't be done in pipeline editor

**Migration:**
- Remove unused fields from encode step config in default pipelines
- Update EncodeStep to not pass unused config to job payload
- Document that encoding settings are profile-only

---

### Option B: Remove EncodingProfiles, Move to Pipeline

**Changes:**
- Remove EncodingProfile model entirely
- Move all encoding settings into pipeline encode step config
- Remove encoding tab from Settings
- Remove profile selection from RequestDialog
- Encode step config becomes comprehensive (all FFmpeg settings)

**Pros:**
- All pipeline behavior (including encoding) defined in one place
- Easier to create custom pipelines with different encoding
- No separate Settings management needed

**Cons:**
- Lose reusability of encoding configurations
- Lose per-server defaults
- Much more complex pipeline configs
- Same settings duplicated across pipelines
- Harder to maintain consistent encoding across all requests
- Breaking change to existing storage server configs

**Migration:**
- Major: Drop EncodingProfile table, StorageServer.encodingProfileId
- Update EncodeStep to read comprehensive config instead of profile
- Migrate existing profiles to pipeline encode step configs
- Update remote encoder protocol to receive config instead of profile

---

### Option C: Profiles for Tech, Pipeline for Quality (Recommended)

**Changes:**
- **EncodingProfile:** Hardware/codec/format settings only
  - videoEncoder, hwAccel, hwDevice, audioEncoder, subtitlesMode, container
  - Remove: videoQuality, videoMaxResolution, videoMaxBitrate
- **Pipeline Encode Step:** Quality/output settings
  - crf, maxResolution, maxBitrate, preset
- **Merge at execution:** EncodeStep combines profile + step config

**Pros:**
- Clear separation of concerns
  - Profile = "how to encode" (hardware, codecs, technical)
  - Step config = "what quality to produce" (CRF, resolution, bitrate)
- Different pipelines can use same profile with different quality
  - Example: "High Quality Movie" pipeline uses crf=18
  - Example: "Fast TV" pipeline uses crf=28
- Reusable technical configs per server
- Flexibility for per-pipeline quality customization

**Cons:**
- More complex implementation (merge logic)
- Need clear documentation on merge behavior
- Both systems remain in place

**Merge Rules:**
```typescript
// Pseudo-code
const finalConfig = {
  // From profile (technical)
  videoEncoder: profile.videoEncoder,
  hwAccel: profile.hwAccel,
  hwDevice: profile.hwDevice,
  audioEncoder: profile.audioEncoder,
  subtitlesMode: profile.subtitlesMode,
  container: profile.container,

  // From step config (quality) - can override profile defaults
  videoQuality: stepConfig.crf ?? profile.defaultCrf ?? 28,
  videoMaxResolution: stepConfig.maxResolution ?? profile.defaultMaxRes ?? "1080p",
  videoMaxBitrate: stepConfig.maxBitrate ?? profile.defaultMaxBitrate,
  preset: stepConfig.preset ?? "medium",
};
```

**Migration:**
- Update EncodingProfile schema: move quality fields to optional defaults
- Update EncodeStep to merge profile + config
- Update encoder protocol to accept merged config
- No user-facing changes needed

---

### Option D: Pipeline References Profile by ID

**Changes:**
- Pipeline encode step config: `{profileId, overrides?: {crf?, maxResolution?}}`
- Remove profile selection from RequestDialog (managed in pipeline)
- EncodeStep uses step.config.profileId instead of context.targets[].encodingProfileId

**Pros:**
- Clear: pipeline defines which profile to use
- Still allows reusable profiles
- Can override specific settings per pipeline

**Cons:**
- Tighter coupling between pipelines and profiles
- Deleting a profile breaks pipelines that reference it
- Less flexible than per-request profile selection

---

## Recommendation: Option C

**Rationale:**

1. **Clear Separation of Concerns**
   - EncodingProfiles handle technical/hardware settings that rarely change
   - Pipeline configs handle quality decisions that vary by use case

2. **Preserves Current UX**
   - Users can still set server defaults
   - Users can still override per request
   - No breaking changes to RequestDialog

3. **Enables Power User Workflows**
   - Create "High Quality" and "Fast" variants of same pipeline
   - Different quality for movies vs TV
   - Same hardware config, different outputs

4. **Practical Example**
   ```
   Server: "Main Storage"
   └─ Default Profile: "Intel ARC AV1"
       ├─ videoEncoder: av1_qsv
       ├─ hwAccel: QSV
       ├─ hwDevice: /dev/dri/renderD128
       ├─ audioEncoder: copy
       └─ container: MKV

   Pipeline: "High Quality Movies"
   └─ Encode Step Config:
       ├─ crf: 18 (overrides profile)
       ├─ maxResolution: 2160p
       └─ preset: slow

   Pipeline: "Fast TV Shows"
   └─ Encode Step Config:
       ├─ crf: 28
       ├─ maxResolution: 1080p
       └─ preset: fast

   Both pipelines use same "Intel ARC AV1" profile
   ```

5. **Migration Path**
   - Refactor EncodingProfile schema (quality → optional defaults)
   - Implement merge logic in EncodeStep
   - Update remote encoder to accept merged config
   - Update default pipelines with quality settings
   - Document the two-layer system

## Implementation Checklist (Option C)

- [ ] Update EncodingProfile schema
  - [ ] Make videoQuality, videoMaxResolution, videoMaxBitrate optional
  - [ ] Rename to defaultVideoQuality, defaultMaxResolution, defaultMaxBitrate
  - [ ] Create migration
- [ ] Update EncodeStep
  - [ ] Implement config merge logic
  - [ ] Validate merged config before sending
  - [ ] Update tests
- [ ] Update EncoderDispatchService
  - [ ] Accept merged config instead of profile-only
  - [ ] Update job:assign message type
- [ ] Update remote encoder
  - [ ] Accept quality params in addition to profile
  - [ ] Update FFmpeg command builder
- [ ] Update documentation
  - [ ] Explain two-layer system
  - [ ] Document merge precedence
  - [ ] Update CLAUDE.md
- [ ] Update default pipelines
  - [ ] Add appropriate quality settings to encode steps
  - [ ] Test with real encoding
