import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }
    const { action, owner, repo, path, branch } = body;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('github');
    const ghHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'base44-github-explorer',
    };

    const safeJson = async (res) => {
      const text = await res.text();
      if (!text) return {};
      try { return JSON.parse(text); }
      catch { return { error: `GitHub returned status ${res.status}: ${text.slice(0, 200)}` }; }
    };

    if (action === 'repo') {
      const b = branch || 'main';
      const [repoRes, treeRes, commitsRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: ghHeaders }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${b}?recursive=1`, { headers: ghHeaders }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=10`, { headers: ghHeaders }),
      ]);

      const repoData = await safeJson(repoRes);
      if (repoData.message || repoData.error) {
        return Response.json({ error: repoData.message || repoData.error }, { status: repoRes.status });
      }

      const treeData = await safeJson(treeRes);
      const commitsData = await safeJson(commitsRes);

      return Response.json({
        repo: repoData,
        tree: treeData.tree || [],
        truncated: treeData.truncated || false,
        commits: Array.isArray(commitsData) ? commitsData : [],
      });
    }

    if (action === 'file') {
      const b = branch || 'main';
      const fileRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path || ''}?ref=${b}`,
        { headers: ghHeaders }
      );
      const fileData = await safeJson(fileRes);
      if (fileData.message || fileData.error) {
        return Response.json({ error: fileData.message || fileData.error }, { status: fileRes.status });
      }

      if (fileData.type === 'file' && fileData.content) {
        const decoded = atob(fileData.content.replace(/\n/g, ''));
        return Response.json({
          name: fileData.name,
          path: fileData.path,
          type: fileData.type,
          size: fileData.size,
          encoding: fileData.encoding,
          content: decoded,
        });
      }

      return Response.json(fileData);
    }

    return Response.json({ error: 'Unknown action. Use "repo" or "file".' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});