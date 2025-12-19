# Phase 8: Cleanup Plan

## Overview

Phase 8 involves removing legacy pipeline code after the new pipeline system has been validated in production. This phase should only be executed after:

1. The new pipeline system has been running in production for at least 1-2 months
2. All critical workflows have been migrated to pipeline templates
3. No major bugs have been reported with the new system
4. User feedback is positive

## Files to Remove

### Legacy Pipeline Services

```
packages/server/src/services/legacyMoviePipeline.ts
packages/server/src/services/legacyTvPipeline.ts
```

These contain the old hardcoded movie and TV pipelines.

### Router Cleanup

**File:** `packages/server/src/routers/requests.ts`

Remove:
- Import statements for legacy pipelines
- Legacy fallback logic in `createMovie` and `createTv`
- `reprocess*` endpoints that use legacy pipelines

Update:
```typescript
// BEFORE (Phase 6)
if (input.pipelineTemplateId) {
  const executor = getPipelineExecutor();
  executor.startExecution(request.id, input.pipelineTemplateId).catch(...);
} else {
  // Fall back to legacy pipeline
  await startLegacyMoviePipeline(request.id);
}

// AFTER (Phase 8)
// Require pipeline template or use default
const templateId = input.pipelineTemplateId || await getDefaultTemplate(input.mediaType);
const executor = getPipelineExecutor();
executor.startExecution(request.id, templateId).catch(...);
```

## Migration Checklist

Before removing legacy code:

- [ ] Create default pipeline templates for Movie and TV
- [ ] Set `isDefault: true` for the default templates
- [ ] Test all common use cases with default templates
- [ ] Update frontend to auto-select default template if user doesn't choose one
- [ ] Monitor error rates for 2+ weeks
- [ ] Create backups of legacy code (git tag: `legacy-pipelines-backup`)
- [ ] Notify users of deprecation timeline (2-4 weeks notice)
- [ ] Remove legacy imports and functions
- [ ] Remove legacy-related tests
- [ ] Update documentation to remove legacy references
- [ ] Run full test suite
- [ ] Deploy to staging
- [ ] Monitor staging for 1 week
- [ ] Deploy to production

## Helper Function for Default Templates

Add to `packages/server/src/routers/requests.ts`:

```typescript
async function getDefaultTemplate(mediaType: "MOVIE" | "TV"): Promise<string> {
  const template = await prisma.pipelineTemplate.findFirst({
    where: {
      mediaType: mediaType === "MOVIE" ? MediaType.MOVIE : MediaType.TV,
      isDefault: true,
    },
    select: { id: true },
  });

  if (!template) {
    throw new Error(`No default pipeline template found for ${mediaType}`);
  }

  return template.id;
}
```

## Database Migrations

No database changes needed - the new pipeline tables already exist and can coexist with requests that used legacy pipelines.

## Testing Strategy

1. **Unit Tests**: Update tests to use new pipeline executor instead of legacy functions
2. **Integration Tests**: Test full request flow with default templates
3. **E2E Tests**: Test UI → API → Pipeline execution
4. **Load Tests**: Ensure new system handles concurrent requests
5. **Rollback Plan**: Keep legacy code in git history, can revert if needed

## Monitoring

After legacy removal:

- Monitor error rates in pipeline executions
- Track time-to-completion metrics
- Monitor resource usage (CPU, memory, DB connections)
- Set up alerts for stuck executions
- Track user-reported issues

## Rollback Plan

If critical issues arise:

1. Revert the commit that removed legacy code
2. Redeploy previous version
3. Investigate issues
4. Fix in new pipeline system
5. Retry Phase 8 after fixes are validated

## Estimated Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Pre-cleanup validation | 1-2 months | Monitor new system in production |
| User notification | 2-4 weeks | Warn users of upcoming changes |
| Staging deployment | 1 week | Test legacy removal in staging |
| Production deployment | 1 day | Remove legacy code in production |
| Post-deployment monitoring | 2 weeks | Watch for issues |

**Total: 2-3 months from Phase 7 completion**

## Success Criteria

Phase 8 is complete when:

- [ ] All legacy pipeline code removed
- [ ] All tests passing with new system
- [ ] No increase in error rates
- [ ] User feedback is positive
- [ ] Documentation updated
- [ ] No legacy references in codebase
