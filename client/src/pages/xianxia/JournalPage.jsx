import { useParams, useNavigate } from 'react-router-dom';
import './xianxia-common.css';

export default function JournalPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  return (
    <div className="x-page">
      <div className="x-header">
        <h1 className="t-heading">世界日志</h1>
        <button className="btn-outline" onClick={() => navigate(`/xianxia/${characterId}`)}>返回</button>
      </div>
      <p className="x-placeholder">时间线视图：已触发世界事件、已知 NPC、奇遇线索将在此展示。</p>
    </div>
  );
}
