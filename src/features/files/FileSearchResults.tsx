import type { TreeNode } from "../../domain/workbench/models";
import { File, Search } from "../../shared/lib/icons";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

interface FileSearchResultsProps {
  query: string;
  results: TreeNode[];
  loading: boolean;
  error: string | null;
  onOpen(result: TreeNode): void;
}

export function FileSearchResults({ query, results, loading, error, onOpen }: FileSearchResultsProps) {
  const selectedPath = useWorkbenchStore((state) => state.selectedTreePath);
  const hasQuery = query.trim().length > 0;

  if (!hasQuery) {
    return <div className="file-search-state"><Search size={15} /><span>输入文件名搜索当前工作区</span></div>;
  }
  if (loading) return <div className="file-search-state">正在搜索…</div>;
  if (error) return <div className="file-search-state file-search-state--error">{error}</div>;
  if (results.length === 0) return <div className="file-search-state">没有找到匹配文件</div>;

  return (
    <div className="file-search-results" role="listbox" aria-label="文件搜索结果">
      {results.map((result) => (
        <button
          key={result.path}
          className={`file-search-result ${selectedPath === result.path ? "is-selected" : ""}`}
          type="button"
          role="option"
          aria-selected={selectedPath === result.path}
          title={result.path}
          onClick={() => onOpen(result)}
        >
          <span className="file-search-result__icon"><File size={13} /></span>
          <span className="file-search-result__copy">
            <strong>{result.name}</strong>
            <small>{result.meta}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
