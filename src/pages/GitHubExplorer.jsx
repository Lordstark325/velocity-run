import { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, File, Folder, Star, GitFork, Eye,
  ChevronRight, ArrowLeft, Loader2, AlertCircle, Clock
} from "lucide-react";

const DEFAULT_REPO = "Lordstark325/sub-surfer-game-";

function buildTree(tree) {
  const root = { name: "", path: "", type: "tree", children: {} };
  for (const item of tree) {
    if (item.type === "tree" && !item.path.includes("/")) continue;
    const parts = item.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.children[part]) {
        node.children[part] = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          type: i === parts.length - 1 ? item.type : "tree",
          children: {},
        };
      }
      node = node.children[part];
    }
  }
  const toArr = (node) =>
    Object.values(node.children)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((n) => (n.type === "tree" ? { ...n, children: toArr(n) } : n));
  return toArr(root);
}

function TreeItem({ node, depth, selectedPath, onSelect }) {
  const [open, setOpen] = useState(depth < 1);
  const isFolder = node.type === "tree";
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <button
        onClick={() => (isFolder ? setOpen(!open) : onSelect(node))}
        className={`flex items-center gap-1.5 w-full text-left px-2 py-1 rounded text-sm hover:bg-accent transition-colors ${
          isSelected ? "bg-primary/10 text-primary font-medium" : ""
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {isFolder ? (
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {isFolder ? (
          <Folder className="h-4 w-4 shrink-0 text-blue-500" />
        ) : (
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isFolder && open && node.children?.map((child) => (
        <TreeItem key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </div>
  );
}

export default function GitHubExplorer() {
  const [repoInput, setRepoInput] = useState(DEFAULT_REPO);
  const [activeRepo, setActiveRepo] = useState(DEFAULT_REPO);
  const [repoData, setRepoData] = useState(null);
  const [tree, setTree] = useState([]);
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState(null);

  const parseRepo = (input) => {
    let s = input.trim();
    s = s.replace(/^https?:\/\/github\.com\//, "");
    s = s.replace(/\/$/, "");
    s = s.replace(/\.git$/, "");
    const parts = s.split("/");
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  };

  const fetchRepo = useCallback(async (input) => {
    const parsed = parseRepo(input);
    if (!parsed) {
      setError("Enter a valid repo in owner/repo format");
      return;
    }
    setLoading(true);
    setError(null);
    setFileContent(null);
    setSelectedPath(null);
    try {
      const res = await base44.functions.invoke("githubRepo", {
        action: "repo",
        owner: parsed.owner,
        repo: parsed.repo,
      });
      if (res.data?.error) {
        setError(res.data.error);
        setRepoData(null);
      } else {
        setRepoData(res.data.repo);
        setTree(buildTree(res.data.tree));
        setCommits(res.data.commits);
        setActiveRepo(`${parsed.owner}/${parsed.repo}`);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to fetch repository");
      setRepoData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRepo(DEFAULT_REPO);
  }, [fetchRepo]);

  const handleFileSelect = async (node) => {
    setSelectedPath(node.path);
    setFileLoading(true);
    setFileContent(null);
    const parsed = parseRepo(activeRepo);
    try {
      const res = await base44.functions.invoke("githubRepo", {
        action: "file",
        owner: parsed.owner,
        repo: parsed.repo,
        path: node.path,
      });
      setFileContent(res.data);
    } catch (e) {
      setFileContent({ error: e.response?.data?.error || e.message });
    } finally {
      setFileLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const isBinary = fileContent?.encoding === "base64" && fileContent.content?.charCodeAt(0) === 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <GitFork className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold hidden sm:inline">Repo Explorer</span>
          </a>
          <form
            onSubmit={(e) => { e.preventDefault(); fetchRepo(repoInput); }}
            className="flex-1 flex gap-2"
          >
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="owner/repo"
                className="pl-9"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Explore"}
            </Button>
          </form>
          <a href="/">
            <Button variant="ghost" size="sm">Play Metro Rush</Button>
          </a>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="font-medium text-destructive">{error}</p>
                <p className="text-sm text-muted-foreground">Check the repository name and try again.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading && !repoData && (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <div className="grid md:grid-cols-[280px_1fr] gap-4">
              <Skeleton className="h-96" />
              <Skeleton className="h-96" />
            </div>
          </div>
        )}

        {repoData && (
          <>
            {/* Repo info */}
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <a
                        href={repoData.owner?.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:underline"
                      >
                        {repoData.owner?.login}
                      </a>
                      <span className="text-muted-foreground">/</span>
                      <h1 className="text-xl font-bold hover:underline">
                        <a href={repoData.html_url} target="_blank" rel="noreferrer">{repoData.name}</a>
                      </h1>
                      <Badge variant="secondary">{repoData.visibility || "public"}</Badge>
                    </div>
                    {repoData.description && (
                      <p className="text-muted-foreground text-sm">{repoData.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span className="font-medium">{repoData.stargazers_count}</span>
                      <span className="text-muted-foreground">stars</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <GitFork className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{repoData.forks_count}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{repoData.watchers_count}</span>
                    </div>
                  </div>
                </div>
                {repoData.language && (
                  <div className="flex items-center gap-2 mt-3">
                    <span className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-sm">{repoData.language}</span>
                    <span className="text-muted-foreground text-sm">· Default branch: {repoData.default_branch}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* File browser + content */}
            <div className="grid md:grid-cols-[280px_1fr] gap-4">
              <Card className="h-fit">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Files ({tree.length} top-level)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="h-[500px]">
                    {tree.map((node) => (
                      <TreeItem
                        key={node.path}
                        node={node}
                        depth={0}
                        selectedPath={selectedPath}
                        onSelect={handleFileSelect}
                      />
                    ))}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  {!fileContent && !fileLoading && (
                    <div className="flex flex-col items-center justify-center h-[500px] text-center text-muted-foreground">
                      <File className="h-12 w-12 mb-3 opacity-40" />
                      <p className="text-sm">Select a file to view its contents</p>
                    </div>
                  )}
                  {fileLoading && (
                    <div className="flex items-center justify-center h-[500px]">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {fileContent?.error && (
                    <div className="flex flex-col items-center justify-center h-[500px] text-center">
                      <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                      <p className="text-sm text-destructive">{fileContent.error}</p>
                    </div>
                  )}
                  {fileContent && !fileContent.error && (
                    <div>
                      <div className="flex items-center justify-between mb-3 pb-3 border-b">
                        <div className="flex items-center gap-2 min-w-0">
                          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="font-medium text-sm truncate">{fileContent.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{formatSize(fileContent.size)}</span>
                      </div>
                      {isBinary ? (
                        <div className="flex flex-col items-center justify-center h-[450px] text-muted-foreground">
                          <p className="text-sm">Binary file — preview not available</p>
                        </div>
                      ) : (
                        <ScrollArea className="h-[450px] rounded-md border bg-muted/30">
                          <pre className="text-xs p-4 font-mono whitespace-pre-wrap break-words">
                            {fileContent.content}
                          </pre>
                        </ScrollArea>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Commits */}
            {commits.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="h-4 w-4" /> Recent Commits
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {commits.map((c) => (
                      <div key={c.sha} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                        <img
                          src={c.author?.avatar_url}
                          alt=""
                          className="w-7 h-7 rounded-full shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {c.commit?.message?.split("\n")[0]}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{c.author?.login || c.commit?.author?.name}</span>
                            <span>·</span>
                            <a
                              href={c.html_url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono hover:underline"
                            >
                              {c.sha?.slice(0, 7)}
                            </a>
                            <span>·</span>
                            <span>{new Date(c.commit?.author?.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}