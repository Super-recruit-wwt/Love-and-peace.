import { useParams, useNavigate } from 'react-router-dom';
import './xianxia-common.css';

export default function MapPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  return (
    <div className="x-page">
      <div className="x-header">
        <h1 className="t-heading">世界地图</h1>
        <button className="btn-outline" onClick={() => navigate(`/xianxia/${characterId}`)}>返回</button>
      </div>
      <p className="x-placeholder">已知地理——中州、北荒、南疆、东海、西漠——将在此以地图形式展示。</p>
    </div>
  );
}
