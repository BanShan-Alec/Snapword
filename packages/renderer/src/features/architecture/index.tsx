import { ArchitectureView } from './components/ArchitectureView';
import { useArchitecture } from './hooks/useArchitecture';

/**
 * 架构说明域入口（feature 唯一公开面）。
 */
function ArchitectureFeature() {
  const { copyCode } = useArchitecture();
  return <ArchitectureView onCopyCode={copyCode} />;
}

export { ArchitectureFeature };
export default ArchitectureFeature;
