import React, { useState, useEffect, useRef, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import OverviewView from './components/OverviewView';
import Bioreactor3DView from './components/Bioreactor3DView';
import ParameterControlsView from './components/ParameterControlsView';
import AnalyticsView from './components/AnalyticsView';
import ComparisonView from './components/ComparisonView';
import AIInsightsView from './components/AIInsightsView';
import ReportsView from './components/ReportsView';
import {
  runSimulation,
  compareScenarios,
  downloadReportPdf,
  downloadReportCsv,
  ORGANISM_PRESETS
} from './services/api';

export default function App() {
  const [activeView, setActiveView] = useState('overview');
  const [presetKey, setPresetKey] = useState('yeast_ethanol');

  // Simulation Parameters
  const [parameters, setParameters] = useState({
    preset_key: 'yeast_ethanol',
    temperature: 30.0,
    ph: 7.0,
    dissolved_oxygen: 60.0,
    substrate: 50.0,
    biomass: 1.0,
    agitation_rpm: 350,
    aeration_vvm: 1.0,
    duration_hours: 36
  });

  // Scenario B candidate parameters
  const [scenarioB, setScenarioB] = useState({
    preset_key: 'yeast_ethanol',
    temperature: 32.0,
    ph: 6.8,
    dissolved_oxygen: 65.0,
    substrate: 60.0,
    biomass: 1.2,
    agitation_rpm: 450,
    aeration_vvm: 1.2,
    duration_hours: 36
  });

  // Simulation State
  const [simulationResult, setSimulationResult] = useState(null);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [history, setHistory] = useState([]);

  // Playback Control States
  const [currentTime, setCurrentTime] = useState(0.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Reference for requestAnimationFrame / interval playback
  const lastTickRef = useRef(performance.now());
  const runCounterRef = useRef(1);

  // Initial Boot Simulation
  useEffect(() => {
    executeSimulation(parameters, false);
  }, []);

  const executeSimulation = async (paramsToRun, shouldAutoPlay = false) => {
    setIsSimulating(true);
    try {
      const res = await runSimulation(paramsToRun);
      if (res && res.success) {
        setSimulationResult(res);

        // Record historical run
        const newRun = {
          runNumber: runCounterRef.current++,
          timestamp: new Date().toLocaleTimeString(),
          organismName: res.organism_info?.name || 'Microbial Twin',
          temperature: res.parameters?.temperature_setpoint,
          ph: res.parameters?.ph_setpoint,
          substrate: res.parameters?.substrate_initial,
          finalBiomass: res.summary_kpis?.final_biomass,
          finalProduct: res.summary_kpis?.final_product,
          productYield: res.summary_kpis?.product_yield_Yps,
          fullData: res
        };
        setHistory(prev => [newRun, ...prev].slice(0, 15));

        // Auto play if requested
        if (shouldAutoPlay) {
          setCurrentTime(0.0);
          setIsPlaying(true);
        }
      }
    } catch (err) {
      console.error("Simulation run error:", err);
    } finally {
      setIsSimulating(false);
    }
  };

  // Smooth simulation playback loop
  useEffect(() => {
    let animId;
    if (isPlaying) {
      lastTickRef.current = performance.now();
      const tick = () => {
        const now = performance.now();
        const deltaSec = (now - lastTickRef.current) / 1000;
        lastTickRef.current = now;

        const maxDuration = parameters.duration_hours || 36.0;

        setCurrentTime(prevTime => {
          // 1 real second = (playbackSpeed * 2.5) simulation hours
          const nextTime = prevTime + deltaSec * playbackSpeed * 2.5;
          if (nextTime >= maxDuration) {
            setIsPlaying(false);
            return maxDuration;
          }
          return nextTime;
        });

        animId = requestAnimationFrame(tick);
      };
      animId = requestAnimationFrame(tick);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, playbackSpeed, parameters.duration_hours]);

  // Compute interpolated instantaneous values at currentTime
  const currentData = useMemo(() => {
    if (!simulationResult || !simulationResult.trajectory) {
      return {
        biomass: parameters.biomass,
        substrate: parameters.substrate,
        product: 0.0,
        temperature: parameters.temperature,
        ph: parameters.ph,
        dissolvedOxygen: parameters.dissolved_oxygen,
        specificGrowthRate: 0.0,
        phase: "Lag Phase"
      };
    }

    const traj = simulationResult.trajectory;
    const times = traj.time || [];
    if (times.length === 0) return {};

    // Find closest or bounding indices
    let idx = times.findIndex(t => t >= currentTime);
    if (idx === -1) idx = times.length - 1;
    if (idx === 0) {
      return {
        biomass: traj.biomass[0],
        substrate: traj.substrate[0],
        product: traj.product[0],
        temperature: traj.temperature[0],
        ph: traj.ph[0],
        dissolvedOxygen: traj.dissolved_oxygen[0],
        specificGrowthRate: traj.specific_growth_rate[0],
        phase: traj.phase[0]
      };
    }

    // Linear interpolation
    const t0 = times[idx - 1];
    const t1 = times[idx];
    const frac = t1 > t0 ? (currentTime - t0) / (t1 - t0) : 0;

    const interp = (arr) => arr[idx - 1] + frac * (arr[idx] - arr[idx - 1]);

    return {
      biomass: interp(traj.biomass),
      substrate: Math.max(0, interp(traj.substrate)),
      product: interp(traj.product),
      temperature: interp(traj.temperature),
      ph: interp(traj.ph),
      dissolvedOxygen: Math.max(0, interp(traj.dissolved_oxygen)),
      specificGrowthRate: interp(traj.specific_growth_rate),
      phase: traj.phase[idx] || "Active Growth"
    };
  }, [simulationResult, currentTime, parameters]);

  // Handlers
  const handleApplyParameters = () => {
    executeSimulation(parameters, true);
  };

  const handleResetDefaults = () => {
    const defaultOrg = ORGANISM_PRESETS[presetKey] || ORGANISM_PRESETS.yeast_ethanol;
    if (defaultOrg && defaultOrg.default_params) {
      const resetParams = {
        preset_key: presetKey,
        ...defaultOrg.default_params
      };
      setParameters(resetParams);
      executeSimulation(resetParams, false);
      setCurrentTime(0.0);
    }
  };

  const handleCloneToScenarioB = () => {
    setScenarioB({
      ...parameters,
      temperature: Math.min(45, parameters.temperature + 2),
      agitation_rpm: Math.min(1000, parameters.agitation_rpm + 100),
      substrate: Math.min(100, parameters.substrate + 10)
    });
    setActiveView('comparison');
  };

  const handlePromoteBToBaseline = () => {
    setParameters({ ...scenarioB });
    executeSimulation(scenarioB, true);
    setActiveView('overview');
  };

  const handleLoadHistoricalRun = (run) => {
    if (run.fullData) {
      setSimulationResult(run.fullData);
      setParameters(run.fullData.parameters);
      setCurrentTime(0.0);
      setActiveView('overview');
    }
  };

  const handleResetPlayback = () => {
    setCurrentTime(0.0);
    setIsPlaying(false);
  };

  const handleStepForward = () => {
    const maxDur = parameters.duration_hours || 36.0;
    setCurrentTime(prev => Math.min(maxDur, prev + 1.0));
  };

  const handleExportPdf = () => {
    if (simulationResult) {
      downloadReportPdf(simulationResult);
    }
  };

  const handleExportCsv = () => {
    if (simulationResult) {
      downloadReportCsv(simulationResult);
    }
  };

  const criticalAlerts = (simulationResult?.ai_insights?.alerts || []).filter(a => a.level === 'CRITICAL');

  return (
    <div className="flex min-h-screen bg-[#070D18] text-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        presetKey={presetKey}
        organismName={simulationResult?.organism_info?.name}
        optimizationScore={simulationResult?.ai_insights?.optimization_score}
        criticalAlertCount={criticalAlerts.length}
      />

      {/* Main Content Stage */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Navbar with playback controls and progress scrubber */}
        <Navbar
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          currentTime={currentTime}
          setCurrentTime={setCurrentTime}
          totalDuration={parameters.duration_hours || 36.0}
          currentPhase={currentData.phase}
          playbackSpeed={playbackSpeed}
          setPlaybackSpeed={setPlaybackSpeed}
          onReset={handleResetPlayback}
          onStepForward={handleStepForward}
          onExportPdf={handleExportPdf}
          onExportCsv={handleExportCsv}
          isSimulating={isSimulating}
        />

        {/* View Switcher Container */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {simulationResult && (
            <>
              {activeView === 'overview' && (
                <OverviewView
                  currentData={currentData}
                  summaryKPIs={simulationResult.summary_kpis}
                  parameters={simulationResult.parameters}
                  organismInfo={simulationResult.organism_info}
                  currentTime={currentTime}
                  trajectory={simulationResult.trajectory}
                  aiInsights={simulationResult.ai_insights}
                  setActiveView={setActiveView}
                />
              )}

              {activeView === 'bioreactor' && (
                <Bioreactor3DView
                  currentData={currentData}
                  parameters={parameters}
                  setParameters={setParameters}
                  currentTime={currentTime}
                  onApplyParameters={handleApplyParameters}
                />
              )}

              {activeView === 'controls' && (
                <ParameterControlsView
                  parameters={parameters}
                  setParameters={setParameters}
                  presetKey={presetKey}
                  setPresetKey={setPresetKey}
                  onApplyParameters={handleApplyParameters}
                  onResetDefaults={handleResetDefaults}
                  isPlaying={isPlaying}
                  setIsPlaying={setIsPlaying}
                  onCloneToScenarioB={handleCloneToScenarioB}
                />
              )}

              {activeView === 'analytics' && (
                <AnalyticsView
                  trajectory={simulationResult.trajectory}
                  summaryKPIs={simulationResult.summary_kpis}
                  organismInfo={simulationResult.organism_info}
                  currentTime={currentTime}
                  totalDuration={parameters.duration_hours || 36.0}
                />
              )}

              {activeView === 'comparison' && (
                <ComparisonView
                  scenarioA={simulationResult}
                  scenarioB={scenarioB}
                  setScenarioB={setScenarioB}
                  comparisonResult={comparisonResult}
                  setComparisonResult={setComparisonResult}
                  onPromoteBToBaseline={handlePromoteBToBaseline}
                  currentTime={currentTime}
                />
              )}

              {activeView === 'insights' && (
                <AIInsightsView
                  aiInsights={simulationResult.ai_insights}
                  parameters={simulationResult.parameters}
                  summaryKPIs={simulationResult.summary_kpis}
                  organismInfo={simulationResult.organism_info}
                  currentTime={currentTime}
                />
              )}

              {activeView === 'reports' && (
                <ReportsView
                  simData={simulationResult}
                  history={history}
                  onLoadHistoricalRun={handleLoadHistoricalRun}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
