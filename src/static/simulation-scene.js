import {connectFieldScene} from "./simulation-field.js";

const stageNames = {seedling:"Mạ non",tillering:"Đẻ nhánh",panicle:"Làm đòng",flowering:"Trổ bông",ripening:"Chín vàng"};

// Drawing strengths are visual cues, never numerical crop predictions.
export function sceneState(result, selectedStage = "panicle") {
  const scene = result?.scene;
  return {
    stage:stageNames[result?.inputs?.stage || selectedStage] || "Làm đòng",
    signals:{leaf_roll:scene?.heatConcern ? .35 : 0,leaf_droop:0,
      tip_burn:scene?.saltReferenceConcern ? .4 : 0,
      water_cover:scene?.submerged ? 1 : 0,soil:scene?.submerged ? "flooded" : "moist"},
  };
}

export class simulationSceneView {
  constructor() {
    this.form = document.getElementById("scenarioForm");
    this.field = connectFieldScene(document.getElementById("field-scene"),document.getElementById("plant-study"));
    document.addEventListener("simulationScene",event => this.render(event.detail));
    this.render(null);
  }
  render(result) {
    const state = sceneState(result,this.form.elements.namedItem("stage").value);
    this.field.setResult(state.stage,state.signals);
    this.field.setConditions({evidenceOnly:true,salinity_gl:0,
      water_depth_cm:Number(this.form.elements.namedItem("waterDepthCm").value),
      temp_c:result?.scene?.heatConcern ? result.inputs.tempMaxC : 28});
  }
}
if (typeof document !== "undefined" && document.getElementById("field-scene")) new simulationSceneView();
