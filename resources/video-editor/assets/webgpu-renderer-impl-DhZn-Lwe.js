const B=`
struct VertexOutput {
 @builtin(position) position: vec4<f32>,
 @location(0) texCoord: vec2<f32>,
};

struct LayerUniforms {
 opacity: f32,
 padding: vec3<f32>,
};

@group(0) @binding(0) var<uniform> layer: LayerUniforms;
@group(1) @binding(0) var textureSampler: sampler;
@group(1) @binding(1) var layerTexture: texture_2d<f32>;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
 var output: VertexOutput;
 let x = f32(i32(vertexIndex & 1u) * 4 - 1);
 let y = f32(i32(vertexIndex >> 1u) * 4 - 1);
 output.position = vec4<f32>(x, y, 0.0, 1.0);
 output.texCoord = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
 return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
 let texColor = textureSample(layerTexture, textureSampler, input.texCoord);
 return vec4<f32>(texColor.rgb, texColor.a * layer.opacity);
}
`,U=`
struct VertexOutput {
 @builtin(position) position: vec4<f32>,
 @location(0) texCoord: vec2<f32>,
};

struct TransformUniforms {
 matrix: mat4x4<f32>,
 opacity: f32,
 borderRadius: f32,
 cropX: f32,
 cropY: f32,
 cropWidth: f32,
 cropHeight: f32,
 padding: vec2<f32>,
};

@group(0) @binding(0) var<uniform> transform: TransformUniforms;
@group(1) @binding(0) var textureSampler: sampler;
@group(1) @binding(1) var layerTexture: texture_2d<f32>;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
 var output: VertexOutput;
 var positions = array<vec2<f32>, 6>(
 vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
 vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
 );
 var texCoords = array<vec2<f32>, 6>(
 vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
 vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
 );
 let pos = positions[vertexIndex];
 output.position = transform.matrix * vec4<f32>(pos, 0.0, 1.0);
 output.texCoord = texCoords[vertexIndex];
 return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
 let croppedUV = vec2<f32>(
 transform.cropX + input.texCoord.x * transform.cropWidth,
 transform.cropY + input.texCoord.y * transform.cropHeight
 );
 let texColor = textureSample(layerTexture, textureSampler, croppedUV);
 return vec4<f32>(texColor.rgb, texColor.a * transform.opacity);
}
`,C=`
struct VertexOutput {
 @builtin(position) position: vec4<f32>,
 @location(0) texCoord: vec2<f32>,
 @location(1) localPos: vec2<f32>,
};

struct BorderRadiusUniforms {
 matrix: mat4x4<f32>,
 opacity: f32,
 radius: f32,
 aspectRatio: f32,
 smoothness: f32,
};

@group(0) @binding(0) var<uniform> uniforms: BorderRadiusUniforms;
@group(1) @binding(0) var textureSampler: sampler;
@group(1) @binding(1) var layerTexture: texture_2d<f32>;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
 var output: VertexOutput;
 var positions = array<vec2<f32>, 6>(
 vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
 vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
 );
 var texCoords = array<vec2<f32>, 6>(
 vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
 vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
 );
 let pos = positions[vertexIndex];
 output.position = uniforms.matrix * vec4<f32>(pos, 0.0, 1.0);
 output.texCoord = texCoords[vertexIndex];
 output.localPos = pos;
 return output;
}

fn sdRoundedRect(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
 let q = abs(p) - b + vec2<f32>(r);
 return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0))) - r;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
 let texColor = textureSample(layerTexture, textureSampler, input.texCoord);
 let halfSize = vec2<f32>(1.0, 1.0);
 let clampedRadius = clamp(uniforms.radius, 0.0, 0.5);
 let dist = sdRoundedRect(input.localPos, halfSize, clampedRadius * 2.0);
 let alpha = 1.0 - smoothstep(-uniforms.smoothness, uniforms.smoothness, dist);
 return vec4<f32>(texColor.rgb, texColor.a * uniforms.opacity * alpha);
}
`;function w(u){const e=new Float32Array(8);return e[0]=u,e}function R(u,e,t,r){const i=new Float32Array(24);return i.set(u,0),i[16]=e,i[17]=t,i[18]=r?.x??0,i[19]=r?.y??0,i[20]=r?.width??1,i[21]=r?.height??1,i}function x(u,e,t,r,i,a){const s=new Float32Array(16),f=u.x/i*2,o=u.y/a*2,n=Math.cos(t),c=Math.sin(t),h=(r.x-.5)*2,l=(r.y-.5)*2;s[0]=e.x*n,s[1]=e.x*c,s[2]=0,s[3]=0,s[4]=-e.y*c,s[5]=e.y*n,s[6]=0,s[7]=0,s[8]=0,s[9]=0,s[10]=1,s[11]=0;const d=f+h*(1-e.x*n)+l*e.y*c,p=o+l*(1-e.y*n)-h*e.x*c;return s[12]=d,s[13]=p,s[14]=0,s[15]=1,s}const S=`
// Effect parameters uniform buffer
struct EffectUniforms {
 brightness: f32, // -1 to 1
 contrast: f32,
 saturation: f32,
 hue: f32, // 0 to 360 degrees
 temperature: f32, // -1 to 1 (cool to warm)
 tint: f32, // -1 to 1 (green to magenta)
 shadows: f32, // -1 to 1
 highlights: f32, // -1 to 1
};

// Image dimensions
struct Dimensions {
 width: u32,
 height: u32,
 padding: vec2<u32>,
};

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> effects: EffectUniforms;
@group(0) @binding(3) var<uniform> dimensions: Dimensions;
fn rgb2hsv(rgb: vec3<f32>) -> vec3<f32> {
 let r = rgb.r;
 let g = rgb.g;
 let b = rgb.b;
 
 let maxC = max(max(r, g), b);
 let minC = min(min(r, g), b);
 let delta = maxC - minC;
 
 var h: f32 = 0.0;
 var s: f32 = 0.0;
 let v: f32 = maxC;
 
 if (delta > 0.00001) {
 s = delta / maxC;
 
 if (maxC == r) {
 h = (g - b) / delta;
 if (g < b) {
 h = h + 6.0;
 }
 } else if (maxC == g) {
 h = 2.0 + (b - r) / delta;
 } else {
 h = 4.0 + (r - g) / delta;
 }
 h = h / 6.0;
 }
 
 return vec3<f32>(h, s, v);
}
fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
 let h = hsv.x * 6.0;
 let s = hsv.y;
 let v = hsv.z;
 
 let i = floor(h);
 let f = h - i;
 let p = v * (1.0 - s);
 let q = v * (1.0 - s * f);
 let t = v * (1.0 - s * (1.0 - f));
 
 let idx = i32(i) % 6;
 
 if (idx == 0) {
 return vec3<f32>(v, t, p);
 } else if (idx == 1) {
 return vec3<f32>(q, v, p);
 } else if (idx == 2) {
 return vec3<f32>(p, v, t);
 } else if (idx == 3) {
 return vec3<f32>(p, q, v);
 } else if (idx == 4) {
 return vec3<f32>(t, p, v);
 } else {
 return vec3<f32>(v, p, q);
 }
}
fn applyBrightness(color: vec3<f32>, brightness: f32) -> vec3<f32> {
 return clamp(color + vec3<f32>(brightness), vec3<f32>(0.0), vec3<f32>(1.0));
}
fn applyContrast(color: vec3<f32>, contrast: f32) -> vec3<f32> {
 return clamp((color - 0.5) * contrast + 0.5, vec3<f32>(0.0), vec3<f32>(1.0));
}
fn applySaturation(color: vec3<f32>, saturation: f32) -> vec3<f32> {
 let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));
 return clamp(mix(vec3<f32>(luminance), color, saturation), vec3<f32>(0.0), vec3<f32>(1.0));
}
fn applyHueRotation(color: vec3<f32>, hueShift: f32) -> vec3<f32> {
 var hsv = rgb2hsv(color);
 hsv.x = fract(hsv.x + hueShift / 360.0);
 return hsv2rgb(hsv);
}
fn applyTemperature(color: vec3<f32>, temperature: f32) -> vec3<f32> {
 var result = color;
 if (temperature > 0.0) {
 result.r = min(1.0, result.r + temperature * 0.2);
 result.g = min(1.0, result.g + temperature * 0.1);
 result.b = max(0.0, result.b - temperature * 0.2);
 } else {
 result.r = max(0.0, result.r + temperature * 0.2);
 result.g = max(0.0, result.g + temperature * 0.05);
 result.b = min(1.0, result.b - temperature * 0.2);
 }
 return result;
}
fn applyTint(color: vec3<f32>, tint: f32) -> vec3<f32> {
 var result = color;
 result.r = clamp(result.r + tint * 0.1, 0.0, 1.0);
 result.g = clamp(result.g - tint * 0.2, 0.0, 1.0);
 result.b = clamp(result.b + tint * 0.1, 0.0, 1.0);
 return result;
}
fn smoothstepCustom(edge0: f32, edge1: f32, x: f32) -> f32 {
 let t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
 return t * t * (3.0 - 2.0 * t);
}
fn applyShadowsHighlights(color: vec3<f32>, shadows: f32, highlights: f32) -> vec3<f32> {
 let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));
 let shadowWeight = 1.0 - smoothstepCustom(0.0, 0.33, luminance);
 let highlightWeight = smoothstepCustom(0.66, 1.0, luminance);
 let adjustment = shadows * shadowWeight * 0.3 + highlights * highlightWeight * 0.3;
 return clamp(color + vec3<f32>(adjustment), vec3<f32>(0.0), vec3<f32>(1.0));
}

// Main compute shader entry point
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
 let x = global_id.x;
 let y = global_id.y;
 
 if (x >= dimensions.width || y >= dimensions.height) {
 return;
 }
 
 let coords = vec2<i32>(i32(x), i32(y));
 var color = textureLoad(inputTexture, coords, 0);
 var rgb = color.rgb;
 if (abs(effects.brightness) > 0.001) {
 rgb = applyBrightness(rgb, effects.brightness);
 }
 if (abs(effects.contrast - 1.0) > 0.001) {
 rgb = applyContrast(rgb, effects.contrast);
 }
 if (abs(effects.saturation - 1.0) > 0.001) {
 rgb = applySaturation(rgb, effects.saturation);
 }
 if (abs(effects.hue) > 0.001) {
 rgb = applyHueRotation(rgb, effects.hue);
 }
 if (abs(effects.temperature) > 0.001) {
 rgb = applyTemperature(rgb, effects.temperature);
 }
 if (abs(effects.tint) > 0.001) {
 rgb = applyTint(rgb, effects.tint);
 }
 if (abs(effects.shadows) > 0.001 || abs(effects.highlights) > 0.001) {
 rgb = applyShadowsHighlights(rgb, effects.shadows, effects.highlights);
 }
 
 textureStore(outputTexture, coords, vec4<f32>(rgb, color.a));
}
`,G=`
// Blur parameters
struct BlurUniforms {
 radius: f32,
 sigma: f32,
 direction: vec2<f32>,
};

struct Dimensions {
 width: u32,
 height: u32,
 padding: vec2<u32>,
};

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> blur: BlurUniforms;
@group(0) @binding(3) var<uniform> dimensions: Dimensions;

fn gaussianWeight(offset: f32, sigma: f32) -> f32 {
 let sigma2 = sigma * sigma;
 return exp(-(offset * offset) / (2.0 * sigma2)) / (sqrt(2.0 * 3.14159265) * sigma);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
 let x = global_id.x;
 let y = global_id.y;
 
 if (x >= dimensions.width || y >= dimensions.height) {
 return;
 }
 
 let coords = vec2<i32>(i32(x), i32(y));
 
 if (blur.radius < 0.5) {
 let color = textureLoad(inputTexture, coords, 0);
 textureStore(outputTexture, coords, color);
 return;
 }
 
 let kernelRadius = i32(min(blur.radius, 20.0));
 let sigma = max(blur.sigma, blur.radius / 3.0);
 
 var colorSum = vec4<f32>(0.0);
 var weightSum: f32 = 0.0;
 
 for (var i = -kernelRadius; i <= kernelRadius; i = i + 1) {
 let offset = vec2<i32>(i32(blur.direction.x * f32(i)), i32(blur.direction.y * f32(i)));
 let sampleCoords = coords + offset;
 let clampedCoords = vec2<i32>(
 clamp(sampleCoords.x, 0, i32(dimensions.width) - 1),
 clamp(sampleCoords.y, 0, i32(dimensions.height) - 1)
 );
 let weight = gaussianWeight(f32(i), sigma);
 colorSum = colorSum + textureLoad(inputTexture, clampedCoords, 0) * weight;
 weightSum = weightSum + weight;
 }
 
 let finalColor = colorSum / weightSum;
 textureStore(outputTexture, coords, finalColor);
}
`;function L(u=0,e=1,t=1,r=0,i=0,a=0,s=0,f=0){const o=new Float32Array(8);return o[0]=u,o[1]=e,o[2]=t,o[3]=r,o[4]=i,o[5]=a,o[6]=s,o[7]=f,o}function M(u=0,e=0,t=1,r=0){const i=new Float32Array(4);return i[0]=u,i[1]=e>0?e:u/3,i[2]=t,i[3]=r,i}function y(u,e){const t=new Uint32Array(4);return t[0]=u,t[1]=e,t[2]=0,t[3]=0,t}class E{device;width;height;effectsPipeline=null;blurPipeline=null;effectsBindGroupLayout=null;blurBindGroupLayout=null;effectsUniformBuffer=null;blurUniformBuffer=null;dimensionsBuffer=null;intermediateTextures=[];currentTextureIndex=0;effectsChangeCallbacks=[];lastEffectsHash=new Map;pendingReRenders=new Map;lastProcessingTime=0;constructor(e){this.device=e.device,this.width=e.width,this.height=e.height}async initialize(){try{return this.createBindGroupLayouts(),await this.createPipelines(),this.createUniformBuffers(),this.createIntermediateTextures(),!0}catch(e){return console.error("[WebGPUEffectsProcessor] Initialization failed:",e),!1}}createBindGroupLayouts(){this.effectsBindGroupLayout=this.device.createBindGroupLayout({label:"Effects Bind Group Layout",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float"}},{binding:1,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:"write-only",format:"rgba8unorm"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]}),this.blurBindGroupLayout=this.device.createBindGroupLayout({label:"Blur Bind Group Layout",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float"}},{binding:1,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:"write-only",format:"rgba8unorm"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]})}async createPipelines(){const e=this.device.createShaderModule({label:"Effects Compute Shader",code:S});this.effectsPipeline=this.device.createComputePipeline({label:"Effects Compute Pipeline",layout:this.device.createPipelineLayout({bindGroupLayouts:[this.effectsBindGroupLayout]}),compute:{module:e,entryPoint:"main"}});const t=this.device.createShaderModule({label:"Blur Compute Shader",code:G});this.blurPipeline=this.device.createComputePipeline({label:"Blur Compute Pipeline",layout:this.device.createPipelineLayout({bindGroupLayouts:[this.blurBindGroupLayout]}),compute:{module:t,entryPoint:"main"}})}createUniformBuffers(){this.effectsUniformBuffer=this.device.createBuffer({label:"Effects Uniform Buffer",size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.blurUniformBuffer=this.device.createBuffer({label:"Blur Uniform Buffer",size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.dimensionsBuffer=this.device.createBuffer({label:"Dimensions Buffer",size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});const e=y(this.width,this.height);this.device.queue.writeBuffer(this.dimensionsBuffer,0,e.buffer)}createIntermediateTextures(){for(const e of this.intermediateTextures)e.destroy();this.intermediateTextures=[];for(let e=0;e<2;e++){const t=this.device.createTexture({label:`Intermediate Texture ${e}`,size:{width:this.width,height:this.height},format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});this.intermediateTextures.push(t)}}processEffects(e,t){const r=performance.now(),i=t.filter(n=>n.enabled);if(i.length===0)return this.lastProcessingTime=performance.now()-r,e;const a=this.aggregateEffectParams(i),s=i.some(n=>n.type==="blur"),f=i.find(n=>n.type==="blur"),o=this.device.createCommandEncoder({label:"Effects Processing"});if(o.copyTextureToTexture({texture:e},{texture:this.intermediateTextures[0]},{width:this.width,height:this.height}),this.currentTextureIndex=0,this.hasColorEffects(a)&&this.applyColorEffects(o,a),s&&f){const n=f.params;this.applyBlur(o,{radius:n.radius??0,sigma:n.sigma})}return this.device.queue.submit([o.finish()]),this.lastProcessingTime=performance.now()-r,this.intermediateTextures[this.currentTextureIndex]}aggregateEffectParams(e){const t={brightness:0,contrast:1,saturation:1,hue:0,temperature:0,tint:0,shadows:0,highlights:0};for(const r of e){const i=r.params;switch(r.type){case"brightness":t.brightness+=i.value??0;break;case"contrast":t.contrast*=i.value??1;break;case"saturation":t.saturation*=i.value??1;break;case"hue":t.hue+=i.rotation??0;break;case"temperature":t.temperature+=i.value??0;break;case"tint":t.tint+=i.value??0;break;case"tonal":t.shadows+=i.shadows??0,t.highlights+=i.highlights??0;break}}return t.brightness=Math.max(-1,Math.min(1,t.brightness)),t.contrast=Math.max(0,Math.min(4,t.contrast)),t.saturation=Math.max(0,Math.min(4,t.saturation)),t.hue=t.hue%360,t.temperature=Math.max(-1,Math.min(1,t.temperature)),t.tint=Math.max(-1,Math.min(1,t.tint)),t.shadows=Math.max(-1,Math.min(1,t.shadows)),t.highlights=Math.max(-1,Math.min(1,t.highlights)),t}hasColorEffects(e){return Math.abs(e.brightness)>.001||Math.abs(e.contrast-1)>.001||Math.abs(e.saturation-1)>.001||Math.abs(e.hue)>.001||Math.abs(e.temperature)>.001||Math.abs(e.tint)>.001||Math.abs(e.shadows)>.001||Math.abs(e.highlights)>.001}applyColorEffects(e,t){const r=L(t.brightness,t.contrast,t.saturation,t.hue,t.temperature,t.tint,t.shadows,t.highlights);this.device.queue.writeBuffer(this.effectsUniformBuffer,0,r.buffer);const i=this.intermediateTextures[this.currentTextureIndex],a=1-this.currentTextureIndex,s=this.intermediateTextures[a],f=this.device.createBindGroup({label:"Effects Bind Group",layout:this.effectsBindGroupLayout,entries:[{binding:0,resource:i.createView()},{binding:1,resource:s.createView()},{binding:2,resource:{buffer:this.effectsUniformBuffer}},{binding:3,resource:{buffer:this.dimensionsBuffer}}]}),o=e.beginComputePass({label:"Effects Compute Pass"});o.setPipeline(this.effectsPipeline),o.setBindGroup(0,f);const n=Math.ceil(this.width/16),c=Math.ceil(this.height/16);o.dispatchWorkgroups(n,c,1),o.end(),this.currentTextureIndex=a}applyBlur(e,t){t.radius<.5||(this.applyBlurPass(e,t,1,0),this.applyBlurPass(e,t,0,1))}applyBlurPass(e,t,r,i){const a=M(t.radius,t.sigma??t.radius/3,r,i);this.device.queue.writeBuffer(this.blurUniformBuffer,0,a.buffer);const s=this.intermediateTextures[this.currentTextureIndex],f=1-this.currentTextureIndex,o=this.intermediateTextures[f],n=this.device.createBindGroup({label:`Blur Bind Group (${r},${i})`,layout:this.blurBindGroupLayout,entries:[{binding:0,resource:s.createView()},{binding:1,resource:o.createView()},{binding:2,resource:{buffer:this.blurUniformBuffer}},{binding:3,resource:{buffer:this.dimensionsBuffer}}]}),c=e.beginComputePass({label:`Blur Compute Pass (${r},${i})`});c.setPipeline(this.blurPipeline),c.setBindGroup(0,n);const h=Math.ceil(this.width/16),l=Math.ceil(this.height/16);c.dispatchWorkgroups(h,l,1),c.end(),this.currentTextureIndex=f}onEffectsChange(e){this.effectsChangeCallbacks.push(e)}notifyEffectsChanged(e,t){const r=this.calculateEffectsHash(t),i=this.lastEffectsHash.get(e);if(r===i)return;this.lastEffectsHash.set(e,r);const a=this.pendingReRenders.get(e);a&&clearTimeout(a);const s=setTimeout(()=>{this.pendingReRenders.delete(e);for(const f of this.effectsChangeCallbacks)f(e,t)},16);this.pendingReRenders.set(e,s)}calculateEffectsHash(e){return e.filter(t=>t.enabled).map(t=>`${t.id}:${t.type}:${JSON.stringify(t.params)}`).join("|")}getLastProcessingTime(){return this.lastProcessingTime}resize(e,t){if(this.width=e,this.height=t,this.dimensionsBuffer){const r=y(e,t);this.device.queue.writeBuffer(this.dimensionsBuffer,0,r.buffer)}this.createIntermediateTextures()}dispose(){for(const e of this.pendingReRenders.values())clearTimeout(e);this.pendingReRenders.clear();for(const e of this.intermediateTextures)e.destroy();this.intermediateTextures=[],this.effectsUniformBuffer?.destroy(),this.blurUniformBuffer?.destroy(),this.dimensionsBuffer?.destroy(),this.effectsUniformBuffer=null,this.blurUniformBuffer=null,this.dimensionsBuffer=null,this.effectsChangeCallbacks=[],this.lastEffectsHash.clear()}}const F=500*1024*1024;function g(u,e){return`${u}:${e.toFixed(6)}`}class D{cache=new Map;maxSize;currentSize=0;onEvict;constructor(e={}){this.maxSize=e.maxSize??F,this.onEvict=e.onEvict}get(e,t){const r=g(e,t),i=this.cache.get(r);return i?(i.lastUsed=Date.now(),i.texture):null}set(e,t,r,i){const a=g(e,t);for(this.cache.has(a)&&this.evictKey(a);this.currentSize+i>this.maxSize&&this.cache.size>0;)this.evictLRU();const s={texture:r,lastUsed:Date.now(),size:i,clipId:e,frameTime:t};this.cache.set(a,s),this.currentSize+=i}evict(e){const t=[];for(const[r,i]of this.cache.entries())i.clipId===e&&t.push(r);for(const r of t)this.evictKey(r)}evictLRU(){if(this.cache.size===0)return;let e=null,t=1/0;for(const[r,i]of this.cache.entries())i.lastUsed<t&&(t=i.lastUsed,e=r);e&&this.evictKey(e)}evictKey(e){const t=this.cache.get(e);t&&(this.onEvict&&this.onEvict(t),t.texture.destroy(),this.currentSize-=t.size,this.cache.delete(e))}clear(){for(const[e]of this.cache.entries())this.evictKey(e)}getMemoryUsage(){return this.currentSize}getMaxSize(){return this.maxSize}getCount(){return this.cache.size}has(e,t){const r=g(e,t);return this.cache.has(r)}getEntriesForClip(e){const t=[];for(const r of this.cache.values())r.clipId===e&&t.push(r);return t}getAllEntries(){return Array.from(this.cache.values())}}function _(u,e,t="rgba8unorm"){const i={rgba8unorm:4,rgba8snorm:4,rgba16float:8,rgba32float:16,bgra8unorm:4,r8unorm:1,rg8unorm:2}[t]??4;return u*e*i}class z{type="webgpu";canvas;adapter=null;device=null;context=null;width;height;_maxTextureCache;deviceLostCallbacks=[];layers=[];isDeviceLost=!1;deviceRecreationInProgress=!1;_config;frameBuffers=[];currentFrameBuffer=0;compositePipeline=null;transformPipeline=null;borderRadiusPipeline=null;compositeUniformLayout=null;compositeTextureLayout=null;transformUniformLayout=null;transformTextureLayout=null;borderRadiusUniformLayout=null;borderRadiusTextureLayout=null;layerUniformBuffer=null;transformUniformBuffer=null;borderRadiusUniformBuffer=null;textureSampler=null;effectsProcessor=null;effectsChangeCallbacks=[];currentFrameTexture=null;lastRenderTime=0;frameCache=null;frameCacheHits=0;frameCacheMisses=0;renderPipelineRef=null;bindGroupLayoutRef=null;constructor(e){this._config=e,this.width=e.width,this.height=e.height,this._maxTextureCache=e.maxTextureCache??500*1024*1024,this.canvas=new OffscreenCanvas(e.width,e.height),this.renderPipelineRef,this.bindGroupLayoutRef}get maxTextureCache(){return this._maxTextureCache}get config(){return this._config}async initialize(){try{if(!navigator.gpu)return console.warn("[WebGPURenderer] WebGPU not supported"),!1;if(this.adapter=await navigator.gpu.requestAdapter({powerPreference:"high-performance"}),!this.adapter)return console.warn("[WebGPURenderer] No GPU adapter available"),!1;if(this.device=await this.adapter.requestDevice({requiredFeatures:[],requiredLimits:{maxTextureDimension2D:Math.max(this.width,this.height,4096),maxBindGroups:4,maxSampledTexturesPerShaderStage:16}}),this.setupDeviceLossHandling(),this.context=this.canvas.getContext("webgpu"),!this.context)return console.warn("[WebGPURenderer] Failed to get WebGPU context"),!1;const e=navigator.gpu.getPreferredCanvasFormat();return this.context.configure({device:this.device,format:e,alphaMode:"premultiplied"}),this.createFrameBuffers(),this.createBindGroupLayouts(),this.createUniformBuffers(),this.createTextureSampler(),await this.initializePipelines(),this.effectsProcessor=new E({device:this.device,width:this.width,height:this.height}),await this.effectsProcessor.initialize(),this.effectsProcessor.onEffectsChange((t,r)=>{this.triggerReRender(t,r)}),this.frameCache=new D({maxSize:this._maxTextureCache,onEvict:t=>{console.debug(`[WebGPURenderer] Evicted frame cache entry: ${t.clipId}:${t.frameTime}`)}}),!0}catch(e){return console.error("[WebGPURenderer] Initialization failed:",e),!1}}setupDeviceLossHandling(){this.device&&this.device.lost.then(e=>{console.warn(`[WebGPURenderer] Device lost: ${e.reason}`,e.message),this.isDeviceLost=!0;for(const t of this.deviceLostCallbacks)t();this.deviceRecreationInProgress||this.attemptDeviceRecreation().catch(t=>{console.error("[WebGPURenderer] Device recreation failed:",t)})})}async attemptDeviceRecreation(){this.deviceRecreationInProgress=!0;const e=3,t=1e3;for(let r=1;r<=e;r++)if(await new Promise(a=>setTimeout(a,t)),await this.recreateDevice()){this.deviceRecreationInProgress=!1;return}console.error("[WebGPURenderer] Failed to recreate device after multiple attempts"),this.deviceRecreationInProgress=!1}createFrameBuffers(){if(this.device){for(const e of this.frameBuffers)e.destroy();this.frameBuffers=[];for(let e=0;e<2;e++){const t=this.device.createTexture({size:{width:this.width,height:this.height},format:"rgba8unorm",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});this.frameBuffers.push(t)}}}createBindGroupLayouts(){this.device&&(this.compositeUniformLayout=this.device.createBindGroupLayout({label:"Composite Uniform Layout",entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]}),this.compositeTextureLayout=this.device.createBindGroupLayout({label:"Composite Texture Layout",entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,sampler:{type:"filtering"}},{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"float"}}]}),this.transformUniformLayout=this.device.createBindGroupLayout({label:"Transform Uniform Layout",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]}),this.transformTextureLayout=this.compositeTextureLayout,this.borderRadiusUniformLayout=this.device.createBindGroupLayout({label:"Border Radius Uniform Layout",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]}),this.borderRadiusTextureLayout=this.compositeTextureLayout,this.bindGroupLayoutRef=this.compositeUniformLayout)}createUniformBuffers(){this.device&&(this.layerUniformBuffer=this.device.createBuffer({label:"Layer Uniform Buffer",size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.transformUniformBuffer=this.device.createBuffer({label:"Transform Uniform Buffer",size:96,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.borderRadiusUniformBuffer=this.device.createBuffer({label:"Border Radius Uniform Buffer",size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}))}createTextureSampler(){this.device&&(this.textureSampler=this.device.createSampler({label:"Texture Sampler",magFilter:"linear",minFilter:"linear",mipmapFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"}))}async initializePipelines(){if(!this.device)return;const e=navigator.gpu.getPreferredCanvasFormat();await this.createCompositePipeline(e),await this.createTransformPipeline("rgba8unorm"),await this.createBorderRadiusPipeline("rgba8unorm"),this.renderPipelineRef=this.compositePipeline}async createCompositePipeline(e){if(!this.device||!this.compositeUniformLayout||!this.compositeTextureLayout)return;const t=this.device.createShaderModule({label:"Composite Shader",code:B});this.compositePipeline=this.device.createRenderPipeline({label:"Composite Pipeline",layout:this.device.createPipelineLayout({bindGroupLayouts:[this.compositeUniformLayout,this.compositeTextureLayout]}),vertex:{module:t,entryPoint:"vertexMain"},fragment:{module:t,entryPoint:"fragmentMain",targets:[{format:e,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}})}async createTransformPipeline(e){if(!this.device||!this.transformUniformLayout||!this.transformTextureLayout)return;const t=this.device.createShaderModule({label:"Transform Shader",code:U});this.transformPipeline=this.device.createRenderPipeline({label:"Transform Pipeline",layout:this.device.createPipelineLayout({bindGroupLayouts:[this.transformUniformLayout,this.transformTextureLayout]}),vertex:{module:t,entryPoint:"vertexMain"},fragment:{module:t,entryPoint:"fragmentMain",targets:[{format:e,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}})}async createBorderRadiusPipeline(e){if(!this.device||!this.borderRadiusUniformLayout||!this.borderRadiusTextureLayout)return;const t=this.device.createShaderModule({label:"Border Radius Shader",code:C});this.borderRadiusPipeline=this.device.createRenderPipeline({label:"Border Radius Pipeline",layout:this.device.createPipelineLayout({bindGroupLayouts:[this.borderRadiusUniformLayout,this.borderRadiusTextureLayout]}),vertex:{module:t,entryPoint:"vertexMain"},fragment:{module:t,entryPoint:"fragmentMain",targets:[{format:e,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}})}isSupported(){return typeof navigator<"u"&&"gpu"in navigator}destroy(){this.effectsProcessor&&(this.effectsProcessor.dispose(),this.effectsProcessor=null),this.frameCache&&(this.frameCache.clear(),this.frameCache=null);for(const e of this.frameBuffers)e.destroy();this.frameBuffers=[],this.currentFrameTexture&&(this.currentFrameTexture.destroy(),this.currentFrameTexture=null),this.layerUniformBuffer?.destroy(),this.transformUniformBuffer?.destroy(),this.borderRadiusUniformBuffer?.destroy(),this.layerUniformBuffer=null,this.transformUniformBuffer=null,this.borderRadiusUniformBuffer=null,this.compositePipeline=null,this.transformPipeline=null,this.borderRadiusPipeline=null,this.renderPipelineRef=null,this.compositeUniformLayout=null,this.compositeTextureLayout=null,this.transformUniformLayout=null,this.transformTextureLayout=null,this.borderRadiusUniformLayout=null,this.borderRadiusTextureLayout=null,this.bindGroupLayoutRef=null,this.textureSampler=null,this.device&&(this.device.destroy(),this.device=null),this.adapter=null,this.context=null,this.deviceLostCallbacks=[],this.effectsChangeCallbacks=[],this.layers=[],this.frameCacheHits=0,this.frameCacheMisses=0}beginFrame(){!this.device||this.isDeviceLost||(this.layers=[],this.currentFrameBuffer=1-this.currentFrameBuffer)}renderLayer(e){this.layers.push(e)}async endFrame(){if(!this.device||!this.context||this.isDeviceLost)throw new Error("WebGPU device not available");const e=performance.now(),t=this.context.getCurrentTexture(),r=this.device.createCommandEncoder({label:"Frame Command Encoder"}),i=this.frameBuffers[this.currentFrameBuffer],a=r.beginRenderPass({label:"Frame Buffer Render Pass",colorAttachments:[{view:i.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});this.renderLayersToPass(a),a.end();const s=r.beginRenderPass({label:"Present Render Pass",colorAttachments:[{view:t.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});this.renderFrameBufferToScreen(s),s.end();const f=r.finish();this.device.queue.submit([f]);const o=Math.ceil(this.width*4/256)*256,n=this.device.createBuffer({size:o*this.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),c=this.device.createCommandEncoder();c.copyTextureToBuffer({texture:i},{buffer:n,bytesPerRow:o},{width:this.width,height:this.height}),this.device.queue.submit([c.finish()]),await n.mapAsync(1);const h=n.getMappedRange(),l=new Uint8ClampedArray(h),d=new Uint8ClampedArray(this.width*this.height*4),p=o,b=this.width*4;for(let m=0;m<this.height;m++){const v=m*p,T=m*b;d.set(l.subarray(v,v+b),T)}n.unmap(),n.destroy();const P=new ImageData(d,this.width,this.height);return this.lastRenderTime=performance.now()-e,createImageBitmap(P,{premultiplyAlpha:"premultiply"})}renderLayersToPass(e){if(!(!this.device||!this.textureSampler))for(const t of this.layers){if(!t.texture||!("createView"in t.texture))continue;const r=t.texture,i=t.borderRadius>0;let a=r;t.effects.length>0&&this.effectsProcessor&&(a=this.effectsProcessor.processEffects(r,t.effects)),i&&this.borderRadiusPipeline?this.renderLayerWithBorderRadius(e,a,t):this.transformPipeline&&this.renderLayerWithTransform(e,a,t)}}renderLayerWithTransform(e,t,r){if(!this.device||!this.transformPipeline||!this.transformUniformBuffer||!this.transformUniformLayout||!this.transformTextureLayout||!this.textureSampler)return;const i=x(r.transform.position,r.transform.scale,r.transform.rotation,r.transform.anchor,this.width,this.height),a=R(i,r.opacity*r.transform.opacity,r.borderRadius,r.transform.crop);this.device.queue.writeBuffer(this.transformUniformBuffer,0,a.buffer);const s=this.device.createBindGroup({label:"Transform Uniform Bind Group",layout:this.transformUniformLayout,entries:[{binding:0,resource:{buffer:this.transformUniformBuffer}}]}),f=this.device.createBindGroup({label:"Transform Texture Bind Group",layout:this.transformTextureLayout,entries:[{binding:0,resource:this.textureSampler},{binding:1,resource:t.createView()}]});e.setPipeline(this.transformPipeline),e.setBindGroup(0,s),e.setBindGroup(1,f),e.draw(6)}renderLayerWithBorderRadius(e,t,r){if(!this.device||!this.borderRadiusPipeline||!this.borderRadiusUniformBuffer||!this.borderRadiusUniformLayout||!this.borderRadiusTextureLayout||!this.textureSampler)return;const i=x(r.transform.position,r.transform.scale,r.transform.rotation,r.transform.anchor,this.width,this.height),a=Math.min(r.borderRadius/100,.5),s=new Float32Array(20);s.set(i,0),s[16]=r.opacity*r.transform.opacity,s[17]=a,s[18]=this.width/this.height,s[19]=.01,this.device.queue.writeBuffer(this.borderRadiusUniformBuffer,0,s.buffer);const f=this.device.createBindGroup({label:"Border Radius Uniform Bind Group",layout:this.borderRadiusUniformLayout,entries:[{binding:0,resource:{buffer:this.borderRadiusUniformBuffer}}]}),o=this.device.createBindGroup({label:"Border Radius Texture Bind Group",layout:this.borderRadiusTextureLayout,entries:[{binding:0,resource:this.textureSampler},{binding:1,resource:t.createView()}]});e.setPipeline(this.borderRadiusPipeline),e.setBindGroup(0,f),e.setBindGroup(1,o),e.draw(6)}renderFrameBufferToScreen(e){if(!this.device||!this.compositePipeline||!this.layerUniformBuffer||!this.compositeUniformLayout||!this.compositeTextureLayout||!this.textureSampler)return;const t=this.frameBuffers[this.currentFrameBuffer],r=w(1);this.device.queue.writeBuffer(this.layerUniformBuffer,0,r.buffer);const i=this.device.createBindGroup({label:"Composite Uniform Bind Group",layout:this.compositeUniformLayout,entries:[{binding:0,resource:{buffer:this.layerUniformBuffer}}]}),a=this.device.createBindGroup({label:"Composite Texture Bind Group",layout:this.compositeTextureLayout,entries:[{binding:0,resource:this.textureSampler},{binding:1,resource:t.createView()}]});e.setPipeline(this.compositePipeline),e.setBindGroup(0,i),e.setBindGroup(1,a),e.draw(3)}createTextureFromImage(e){if(!this.device)throw new Error("WebGPU device not initialized");const t=this.device.createTexture({size:{width:e.width,height:e.height},format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return this.device.queue.copyExternalImageToTexture({source:e},{texture:t},{width:e.width,height:e.height}),t}releaseTexture(e){e&&"destroy"in e&&e.destroy()}applyEffects(e,t){return!this.effectsProcessor||!e||!("destroy"in e&&"createView"in e)?e:this.effectsProcessor.processEffects(e,t)}notifyEffectsChanged(e,t){this.effectsProcessor&&this.effectsProcessor.notifyEffectsChanged(e,t)}onEffectsReRender(e){this.effectsChangeCallbacks.push(e)}triggerReRender(e,t){const r=performance.now();for(const i of this.effectsChangeCallbacks)i(e,t);this.lastRenderTime=performance.now()-r,this.lastRenderTime>100&&console.warn(`[WebGPURenderer] Re-render took ${this.lastRenderTime.toFixed(2)}ms, exceeds 100ms target`)}getLastRenderTime(){return this.lastRenderTime}getEffectsProcessingTime(){return this.effectsProcessor?.getLastProcessingTime()??0}onDeviceLost(e){this.deviceLostCallbacks.push(e)}async recreateDevice(){return this.isDeviceLost=!1,this.destroy(),this.initialize()}resize(e,t){if(this.width=e,this.height=t,this.canvas.width=e,this.canvas.height=t,this.context&&this.device){const r=navigator.gpu.getPreferredCanvasFormat();this.context.configure({device:this.device,format:r,alphaMode:"premultiplied"}),this.createFrameBuffers(),this.effectsProcessor&&this.effectsProcessor.resize(e,t)}}getMemoryUsage(){return this.width*this.height*4*2}getDevice(){return this.device}isLost(){return this.isDeviceLost}getCachedFrame(e,t){if(!this.frameCache)return null;const r=this.frameCache.get(e,t);return r?(this.frameCacheHits++,r):(this.frameCacheMisses++,null)}cacheFrame(e,t,r){if(!this.device)throw new Error("WebGPU device not initialized");const i=this.getCachedFrame(e,t);if(i)return i;const a=this.createTextureFromImage(r),s=_(r.width,r.height,"rgba8unorm");return this.frameCache&&this.frameCache.set(e,t,a,s),a}hasFrameCached(e,t){return this.frameCache?.has(e,t)??!1}evictClipFrames(e){this.frameCache?.evict(e)}getFrameCacheStats(){const e=this.frameCacheHits+this.frameCacheMisses;return{hits:this.frameCacheHits,misses:this.frameCacheMisses,hitRate:e>0?this.frameCacheHits/e:0,memoryUsage:this.frameCache?.getMemoryUsage()??0,maxSize:this.frameCache?.getMaxSize()??0,entryCount:this.frameCache?.getCount()??0}}clearFrameCache(){this.frameCache?.clear(),this.frameCacheHits=0,this.frameCacheMisses=0}getRenderPipeline(){return this.compositePipeline}getTransformPipeline(){return this.transformPipeline}getBorderRadiusPipeline(){return this.borderRadiusPipeline}arePipelinesInitialized(){return this.compositePipeline!==null&&this.transformPipeline!==null&&this.borderRadiusPipeline!==null}}const I=Object.freeze(Object.defineProperty({__proto__:null,WebGPURenderer:z},Symbol.toStringTag,{value:"Module"}));export{D as T,z as W,E as a,B as b,_ as c,C as d,w as e,R as f,x as g,S as h,G as i,L as j,M as k,y as l,U as t,I as w};
