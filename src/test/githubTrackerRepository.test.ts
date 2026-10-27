import { describe, it, expect, vi } from 'vitest';
import { GitHubTrackerRepository } from '../services/GitHubTrackerRepository';
import { decodeGitHubBase64 } from '../services/githubClient';
import { GitHubTrackerRepositoryError } from '../services/githubErrors';
import { Destination } from '../domain/models';

describe('Phase 2: GitHubTrackerRepository — Safe Read Foundation', () => {
  function createSyntheticSnapshotPayload() {
    const destinations: Destination[] = [
      {
        id: 'DEST:MV-01-01',
        multiviewId: 'MV-01',
        destinationNumber: 1,
        assignedSourceId: 'SRC:TEST_SOURCE_A',
        lawoSourceName: 'TEST-LAWO-A',
        assignmentName: 'TEST-ASSIGNMENT',
        locked: false,
        updatedAt: null,
        updatedBy: null,
      },
      {
        id: 'DEST:MV-01-02',
        multiviewId: 'MV-01',
        destinationNumber: 2,
        assignedSourceId: null,
        lawoSourceName: 'TEST-LAWO-ONLY',
        assignmentName: null,
        locked: false,
        updatedAt: null,
        updatedBy: null,
      },
    ];

    return {
      multiviews: [
        {
          id: 'MV-01',
          displayName: 'Test Multiview 01',
          inputCapacity: 36,
          outputCapacity: 4,
        },
      ],
      outputs: [
        {
          id: 'OUT:MV-01-01',
          multiviewId: 'MV-01',
          outputNumber: 1,
          layoutName: '4 BOX',
          destinationStart: 1,
          destinationEnd: 4,
          rawDestinationRange: '1-4',
          assignmentName: 'TEST-ASSIGNMENT',
          notes: null,
          status: 'Assigned',
          locked: false,
          updatedAt: null,
          updatedBy: null,
        },
      ],
      destinations,
      sources: [
        {
          id: 'SRC:TEST_SOURCE_A',
          name: 'TEST-SOURCE-A',
          normalizedName: 'TEST-SOURCE-A',
          category: 'Virtual Camera',
          active: true,
          upstreamSourceId: null,
          sourceType: 'originating',
        },
      ],
      operationalAssignments: [
        {
          id: 'ASSIGN:TEST_ASSIGNMENT',
          rawName: 'TEST-ASSIGNMENT',
          displayName: 'TEST-ASSIGNMENT',
          active: true,
        },
      ],
      metadata: {
        schemaVersion: 1,
        sourceWorkbook: 'synthetic/test_workbook.xlsx',
        sourceWorkbookHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        generatorVersion: '1.0.0',
        deterministicGeneration: true,
      },
    };
  }

  function createGitHubFileApiResponse(
    payloadObj: unknown,
    sha = 'synth_sha_12345',
    encoding = 'base64',
    type = 'file'
  ) {
    const jsonStr = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);
    const base64 = Buffer.from(jsonStr, 'utf8').toString('base64');
    return {
      name: 'tracker.json',
      path: 'data/tracker.json',
      sha,
      size: base64.length,
      url: 'https://api.github.com/repos/ZZworkingZZ/VIP-Tracker-Data/contents/data/tracker.json',
      type,
      content: base64,
      encoding,
    };
  }

  function createMockFetch(responseInit: {
    status?: number;
    ok?: boolean;
    body?: unknown;
    headers?: Record<string, string>;
  }) {
    const status = responseInit.status ?? 200;
    const ok = responseInit.ok ?? (status >= 200 && status < 300);
    const headersMap = new Map(Object.entries(responseInit.headers ?? {}));

    const mockFn = vi.fn().mockResolvedValue({
      status,
      ok,
      headers: {
        get: (h: string) => headersMap.get(h.toLowerCase()) ?? null,
      },
      text: async () =>
        typeof responseInit.body === 'string'
          ? responseInit.body
          : JSON.stringify(responseInit.body ?? {}),
      json: async () => responseInit.body ?? {},
    });

    return mockFn as unknown as typeof fetch;
  }

  it('1. Successfully loads a synthetic valid TrackerSnapshot', async () => {
    const payload = createSyntheticSnapshotPayload();
    const mockFetch = createMockFetch({ body: createGitHubFileApiResponse(payload) });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-test-token',
      fetchFn: mockFetch,
    });

    const snapshot = await repo.getSnapshot();
    expect(snapshot.multiviews).toHaveLength(1);
    expect(snapshot.outputs).toHaveLength(1);
    expect(snapshot.destinations).toHaveLength(2);
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.operationalAssignments).toHaveLength(1);
    expect(snapshot.metadata?.schemaVersion).toBe(1);
  });

  it('2. Correctly constructs request URL using owner, repository, branch, and file path', async () => {
    const payload = createSyntheticSnapshotPayload();
    const mockFetch = createMockFetch({ body: createGitHubFileApiResponse(payload) });

    const repo = new GitHubTrackerRepository({
      config: {
        owner: 'CustomOwner',
        repo: 'CustomRepo',
        branch: 'feature-branch',
        path: 'nested/path/tracker.json',
      },
      tokenProvider: () => 'synthetic-token',
      fetchFn: mockFetch,
    });

    await repo.getSnapshot();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/CustomOwner/CustomRepo/contents/nested/path/tracker.json?ref=feature-branch',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('3. Supplies authorization through injected tokenProvider without hardcoded credentials', async () => {
    const payload = createSyntheticSnapshotPayload();
    const mockFetch = createMockFetch({ body: createGitHubFileApiResponse(payload) });
    const tokenProvider = vi.fn().mockResolvedValue('dynamic-injected-token-999');

    const repo = new GitHubTrackerRepository({
      tokenProvider,
      fetchFn: mockFetch,
    });

    await repo.getSnapshot();

    expect(tokenProvider).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer dynamic-injected-token-999',
        }),
      })
    );
  });

  it('4. Successfully decodes Base64 content including newlines and UTF-8 characters', () => {
    const originalText = 'Test Multiview with UTF-8 chars: üñîçødé';
    const base64WithNewlines = Buffer.from(originalText, 'utf8')
      .toString('base64')
      .match(/.{1,10}/g)!
      .join('\n');

    const decoded = decodeGitHubBase64(base64WithNewlines);
    expect(decoded).toBe(originalText);
  });

  it('5. Retains and returns the GitHub file SHA from the loaded tracker file', async () => {
    const expectedSha = 'blob_sha_abc123789';
    const payload = createSyntheticSnapshotPayload();
    const mockFetch = createMockFetch({
      body: createGitHubFileApiResponse(payload, expectedSha),
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: mockFetch,
    });

    expect(repo.getLastLoadedSha()).toBeNull();

    const loadResult = await repo.loadSnapshot();
    expect(loadResult.sha).toBe(expectedSha);
    expect(repo.getLastLoadedSha()).toBe(expectedSha);
  });

  it('6. Preserves optional fields (lawoSourceName, rawDestinationRange, metadata) across load', async () => {
    const payload = createSyntheticSnapshotPayload();
    const mockFetch = createMockFetch({ body: createGitHubFileApiResponse(payload) });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: mockFetch,
    });

    const snapshot = await repo.getSnapshot();
    const dest = snapshot.destinations.find((d) => d.id === 'DEST:MV-01-01')!;
    expect(dest.lawoSourceName).toBe('TEST-LAWO-A');

    const out = snapshot.outputs.find((o) => o.id === 'OUT:MV-01-01')!;
    expect(out.rawDestinationRange).toBe('1-4');

    expect(snapshot.metadata).toBeDefined();
    expect(snapshot.metadata?.sourceWorkbook).toBe('synthetic/test_workbook.xlsx');
  });

  it('7. Successfully loads compatible snapshots without optional fields', async () => {
    const minimalPayload = {
      multiviews: [{ id: 'MV-01', displayName: 'MV 01', inputCapacity: 36, outputCapacity: 4 }],
      outputs: [
        {
          id: 'OUT:MV-01-01',
          multiviewId: 'MV-01',
          outputNumber: 1,
          layoutName: null,
          destinationStart: null,
          destinationEnd: null,
          assignmentName: null,
          notes: null,
          status: 'Available',
          locked: false,
          updatedAt: null,
          updatedBy: null,
        },
      ],
      destinations: [
        {
          id: 'DEST:MV-01-01',
          multiviewId: 'MV-01',
          destinationNumber: 1,
          assignedSourceId: null,
          assignmentName: null,
          locked: false,
          updatedAt: null,
          updatedBy: null,
        },
      ],
      sources: [],
      operationalAssignments: [],
    };

    const mockFetch = createMockFetch({ body: createGitHubFileApiResponse(minimalPayload) });
    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: mockFetch,
    });

    const snapshot = await repo.getSnapshot();
    expect(snapshot.metadata).toBeUndefined();
    expect(snapshot.destinations[0].lawoSourceName).toBeUndefined();
    expect(snapshot.outputs[0].rawDestinationRange).toBeUndefined();
  });

  it('8. Validates that Lawo-only destination with assignedSourceId: null remains valid', async () => {
    const payload = createSyntheticSnapshotPayload();
    const mockFetch = createMockFetch({ body: createGitHubFileApiResponse(payload) });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: mockFetch,
    });

    const snapshot = await repo.getSnapshot();
    const lawoOnlyDest = snapshot.destinations.find((d) => d.id === 'DEST:MV-01-02')!;
    expect(lawoOnlyDest.assignedSourceId).toBeNull();
    expect(lawoOnlyDest.lawoSourceName).toBe('TEST-LAWO-ONLY');

    // Validation findings must not report unknown source error for assignedSourceId: null
    const unknownSourceErrors = snapshot.validationFindings.filter(
      (f) => f.code === 'DESTINATION_UNKNOWN_SOURCE'
    );
    expect(unknownSourceErrors).toHaveLength(0);
  });

  it('9. Rejects with MISSING_AUTHENTICATION when token capability is missing', async () => {
    const repo = new GitHubTrackerRepository({
      tokenProvider: () => null,
      fetchFn: createMockFetch({ body: {} }),
      requireAuth: true,
    });

    await expect(repo.getSnapshot()).rejects.toMatchObject({
      code: 'MISSING_AUTHENTICATION',
    });
  });

  it('10. Handles HTTP 401 as AUTHENTICATION_FAILED', async () => {
    const mockFetch = createMockFetch({ status: 401, body: { message: 'Bad credentials' } });
    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'bad-token',
      fetchFn: mockFetch,
    });

    await expect(repo.getSnapshot()).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
      status: 401,
    });
  });

  it('11. Distinguishes rate limiting from standard HTTP 403 authorization failures', async () => {
    // 11a: Rate limited via x-ratelimit-remaining header
    const rateLimitedFetch = createMockFetch({
      status: 403,
      headers: { 'x-ratelimit-remaining': '0' },
      body: { message: 'API rate limit exceeded' },
    });
    const repoRateLimited = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: rateLimitedFetch,
    });
    await expect(repoRateLimited.getSnapshot()).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 403,
    });

    // 11b: Standard 403 authorization failure
    const forbiddenFetch = createMockFetch({
      status: 403,
      headers: { 'x-ratelimit-remaining': '50' },
      body: { message: 'Must have push access' },
    });
    const repoForbidden = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: forbiddenFetch,
    });
    await expect(repoForbidden.getSnapshot()).rejects.toMatchObject({
      code: 'AUTHORIZATION_FAILED',
      status: 403,
    });
  });

  it('12. Handles HTTP 404 repository or file not found', async () => {
    const notFoundFetch = createMockFetch({ status: 404, body: { message: 'Not Found' } });
    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: notFoundFetch,
    });

    await expect(repo.getSnapshot()).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('13. Rejects malformed GitHub response payload', async () => {
    // Returns array or object missing required file fields
    const malformedFetch = createMockFetch({ body: [{ unexpected: 'array' }] });
    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: malformedFetch,
    });

    await expect(repo.getSnapshot()).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('14. Rejects unsupported encoding or resource type', async () => {
    // 14a: Resource is directory, not file
    const dirFetch = createMockFetch({
      body: { type: 'dir', content: '', encoding: 'none', sha: '123', path: 'data' },
    });
    const repoDir = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: dirFetch,
    });
    await expect(repoDir.getSnapshot()).rejects.toMatchObject({
      code: 'UNSUPPORTED_ENCODING',
    });

    // 14b: Content encoding is not base64
    const badEncodingFetch = createMockFetch({
      body: { type: 'file', content: 'raw', encoding: 'none', sha: '123', path: 'data.json' },
    });
    const repoBadEncoding = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: badEncodingFetch,
    });
    await expect(repoBadEncoding.getSnapshot()).rejects.toMatchObject({
      code: 'UNSUPPORTED_ENCODING',
    });
  });

  it('15. Rejects invalid Base64 content with INVALID_BASE64', async () => {
    const invalidBase64Fetch = createMockFetch({
      body: {
        type: 'file',
        content: 'not-valid-base64!!!',
        encoding: 'base64',
        sha: '123',
        path: 'data/tracker.json',
      },
    });
    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: invalidBase64Fetch,
    });

    await expect(repo.getSnapshot()).rejects.toMatchObject({
      code: 'INVALID_BASE64',
    });
  });

  it('16. Rejects invalid JSON content with INVALID_JSON', async () => {
    const rawMalformedJson = '{ bad json without matching brace';
    const mockFetch = createMockFetch({
      body: createGitHubFileApiResponse(rawMalformedJson),
    });
    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: mockFetch,
    });

    await expect(repo.getSnapshot()).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('17. Rejects structurally invalid TrackerSnapshot with INCOMPATIBLE_SCHEMA', async () => {
    const missingDestinations = {
      multiviews: [],
      outputs: [],
      // destinations missing
      sources: [],
      operationalAssignments: [],
    };
    const mockFetch = createMockFetch({
      body: createGitHubFileApiResponse(missingDestinations),
    });
    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: mockFetch,
    });

    await expect(repo.getSnapshot()).rejects.toMatchObject({
      code: 'INCOMPATIBLE_SCHEMA',
    });
  });

  it('18. Rejects duplicate entity IDs with VALIDATION_FAILURE', async () => {
    const payload = createSyntheticSnapshotPayload();
    // Add duplicate destination ID
    payload.destinations.push({
      id: 'DEST:MV-01-01', // duplicate
      multiviewId: 'MV-01',
      destinationNumber: 3,
      assignedSourceId: null,
      lawoSourceName: null,
      assignmentName: null,
      locked: false,
      updatedAt: null,
      updatedBy: null,
    });

    const mockFetch = createMockFetch({
      body: createGitHubFileApiResponse(payload),
    });
    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: mockFetch,
    });

    await expect(repo.getSnapshot()).rejects.toMatchObject({
      code: 'VALIDATION_FAILURE',
    });
  });

  it('19. Rejects unresolved assignedSourceId with VALIDATION_FAILURE', async () => {
    const payload = createSyntheticSnapshotPayload();
    payload.destinations[0].assignedSourceId = 'SRC:UNKNOWN_NON_EXISTENT';

    const mockFetch = createMockFetch({
      body: createGitHubFileApiResponse(payload),
    });
    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: mockFetch,
    });

    await expect(repo.getSnapshot()).rejects.toMatchObject({
      code: 'VALIDATION_FAILURE',
    });
  });

  it('20. Explicitly rejects all write/mutation operations with READ_ONLY_OPERATION', async () => {
    const payload = createSyntheticSnapshotPayload();
    const mockFetch = createMockFetch({ body: createGitHubFileApiResponse(payload) });
    const repo = new GitHubTrackerRepository({
      isReadOnly: true,
      tokenProvider: () => 'synth-token',
      fetchFn: mockFetch,
    });

    const snapshot = await repo.getSnapshot();

    await expect(repo.saveSnapshot(snapshot)).rejects.toMatchObject({
      code: 'READ_ONLY_OPERATION',
    });

    await expect(repo.resetToBaseline()).rejects.toMatchObject({
      code: 'READ_ONLY_OPERATION',
    });

    await expect(
      repo.saveCustomLayout({
        id: 'cust-1',
        name: 'Custom',
        windowCount: 1,
        aspectRatio: '16:9',
        category: 'Custom',
        description: 'Custom test',
        windows: [
          {
            id: 'w-1',
            pipId: 'PIP-01',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            destinationOffset: 0,
          },
        ],
      })
    ).rejects.toMatchObject({
      code: 'READ_ONLY_OPERATION',
    });

    await expect(repo.deleteCustomLayout('cust-1')).rejects.toMatchObject({
      code: 'READ_ONLY_OPERATION',
    });
  });

  it('21. Guarantees error messages never expose sensitive credential material', async () => {
    const secretToken = 'ghp_super_secret_token_1234567890';
    const mockFetch = vi.fn().mockRejectedValue(new Error(`Failed with Bearer ${secretToken}`));

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => secretToken,
      fetchFn: mockFetch,
    });

    try {
      await repo.getSnapshot();
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GitHubTrackerRepositoryError);
      const errorMsg = (err as Error).message;
      expect(errorMsg).not.toContain(secretToken);
      expect(errorMsg).toContain('[REDACTED]');
    }
  });

  it('22. Uses strictly synthetic test values with zero real operational data', async () => {
    const payload = createSyntheticSnapshotPayload();
    const str = JSON.stringify(payload);

    // Verify synthetic markers
    expect(str).toContain('MV-01');
    expect(str).toContain('TEST-SOURCE-A');
    expect(str).toContain('TEST-LAWO-A');
    expect(str).toContain('TEST-ASSIGNMENT');

    // Confirm no real operational records or workbook references
    expect(str).not.toContain('Evertz VIP Source Tracker (mockup)');
    expect(str).not.toContain('HOH-WKB');
  });

  it('delegates slice getters (getOutputs, getSources, etc.) to getSnapshot', async () => {
    const payload = createSyntheticSnapshotPayload();
    const mockFetch = createMockFetch({ body: createGitHubFileApiResponse(payload) });
    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synth-token',
      fetchFn: mockFetch,
    });

    const mvs = await repo.getMultiviews();
    expect(mvs).toHaveLength(1);

    const outputs = await repo.getOutputs();
    expect(outputs).toHaveLength(1);

    const dests = await repo.getDestinations();
    expect(dests).toHaveLength(2);

    const sources = await repo.getSources();
    expect(sources).toHaveLength(1);

    const ops = await repo.getOperationalAssignments();
    expect(ops).toHaveLength(1);

    const findings = await repo.getValidationFindings();
    expect(Array.isArray(findings)).toBe(true);

    const history = await repo.getChangeHistory();
    expect(Array.isArray(history)).toBe(true);
  });
});
