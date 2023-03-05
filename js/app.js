(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/*
  A three.js-representation of a normalized CSG tree

  Classes:
  CSGScene     - a list of CSGProducts
  CSGProduct   - a list of intersections and a list of subtractions (THREE.Object3D instances)
  
*/

function CSGScene() {
  this.products = []; // Array of CSGProduct objects
  this.raycaster = new THREE.Raycaster();
  this.pickingscene = new THREE.Group();
  this.pickingscene.csgscene = this;
  this.nodemap = {};
}

// For picking:
// Group (pickingscene)
//   + - Group (prodgroup)
//   |     + - Group (intgroup)
//   |     |     + - children (intersections)
//   |     + - Group (diffgroup)
//   |           + - children (differences)
// [...]
CSGScene.prototype = {
  constructor: CSGScene,
  add: function(product) {
    this.products.push(product);
    var prodgroup = product.createPickingGroup();
    this.pickingscene.add(prodgroup);
  },
  load: function(url, callback) {
    console.log('loading ' + url + '...');
    this.nodemap = {};
    this.pickingscene = new THREE.Group();
    var loader = new THREE.ObjectLoader();
    loader.load(url, this.loaderFinished.bind(this, callback));
  },
  loaderFinished: function(callback, result) {
    console.log('loaderFinished');
    var root = result;
    var self = this;
    root.children.forEach(function(ch) { // Loop over top-level objects (products)
// FIXME: Reinstate transparents
//      if (ch.userData.type === 'transparents') {
//        self.transparents = ch.children;
//        return;
//      }
      var intersections, differences;
      ch.children.forEach(function(child) {
        if (child.userData) {
	  if (child.userData.type === 'intersections') {
	    intersections = child.children;
	  }
	  else if (child.userData.type === 'differences') {
	    differences = child.children;
	  }
        }
      });
      // Since we don't have the CSG tree available, create placeholder
      // objects for the missing CSGLeaf.
      function registerMesh(mesh) {
        var csgleafkey = mesh.userData.csgleaf || mesh.name || THREE.Math.generateUUID();
        var csgleaf = self.nodemap[csgleafkey];
        if (csgleaf === undefined) {
          csgleaf = self.nodemap[csgleafkey] = {
            meshes: []
          };
        }
        csgleaf.meshes.push(mesh);
        mesh.csgleaf = csgleaf;
      }
      intersections.forEach(registerMesh);
      if (differences) differences.forEach(registerMesh);
      var product = new CSGProduct(intersections, differences);
      self.add(product);
    });
    console.log('callback');
    callback();
  },
  pick: function(mouse, camera) {
    this.raycaster.setFromCamera(mouse, camera);
    var intersects = this.raycaster.intersectObject(this.pickingscene, true);
    console.log("intersects: " + intersects.length);
    console.log(this.pickingscene);
    // Reset all product.insidecount
    for (var i = 0; i < this.products.length; i++) {
      this.products[i].insidecount = 0;
    }
    // Walk intersections front-to-back until first solid surface is found
    var intersect_str = ""
    for (var i = 0; i < intersects.length; i++) {
      var intersection = intersects[i];
      var obj = intersection.object;
      var product = obj.parent.parent.product;
      // intersections are in local coordinates
      var normalMatrix = new THREE.Matrix3().getNormalMatrix(obj.matrixWorld);
      var worldNormal = intersection.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      var frontface = this.raycaster.ray.direction.dot(worldNormal) < 0;
      var negative = obj.parent.differences === true;
      var reverse = frontface ? 1 : -1;
      product.insidecount = product.insidecount + reverse * (negative ? -1 : 1);
      if (i > 0) intersect_str += "->";
      if (!frontface) intersect_str += "/";
      var name = (obj.name || obj.geometry.type);
      intersect_str += name;
      if (product.insidecount == product.numIntersections) {
        // Found picked Object3D: obj
        console.log("Found: " + name);
        console.log(intersect_str);
        return obj.original;
      }
    }
    console.log(intersect_str);
  },
  toJSON: function() {
    var root = new THREE.Group;
    this.products.forEach(function(product) {
      var prodgroup = new THREE.Group;
      var intgroup = new THREE.Group;
      intgroup.userData.type = 'intersections';
      product.intersections.forEach(function(intersection) {
        intgroup.children.push(intersection);
      });
      prodgroup.children.push(intgroup);
      if (product.differences) {
        var diffgroup = new THREE.Group;
        diffgroup.userData.type = 'differences';
        product.differences.forEach(function(difference) {
          diffgroup.children.push(difference);
        });
        prodgroup.children.push(diffgroup);
      }
      root.children.push(prodgroup);
    });
    root.updateMatrixWorld();
    var json = root.toJSON();
    return JSON.stringify(json, null, 2);
  }
};

function CSGProduct(intersections, differences) {
  this.numIntersections = intersections.length;
  this.intersections = intersections; // Array of Object3D
  this.differences = differences; // Array of Object3D
}

function createPickingMesh(mesh) {
  var pickmesh = mesh.clone()
  pickmesh.material = new THREE.MeshBasicMaterial();
  pickmesh.material.side = THREE.DoubleSide;
  pickmesh.updateMatrixWorld(true);
  pickmesh.original = mesh;
  return pickmesh;
}

CSGProduct.prototype = {
  constructor: CSGProduct,
  createPickingGroup: function() {
    var intgroup = new THREE.Group();
    intgroup.intersections = true;
    this.intersections.forEach(function(mesh) { intgroup.add(createPickingMesh(mesh)); });
    var diffgroup = new THREE.Group();
    diffgroup.differences = true;
    if (this.differences) this.differences.forEach(function(mesh) { diffgroup.add(createPickingMesh(mesh)); });
    var prodgroup = new THREE.Group();
    prodgroup.product = this;
    prodgroup.add(intgroup, diffgroup);
    return prodgroup;
  }
};

exports.CSGScene = CSGScene;
exports.CSGProduct = CSGProduct;

},{}],2:[function(require,module,exports){
function SCSRenderer(renderer) {
  var self = this;
  this.renderer = renderer;
  this.gl = renderer.getContext();
  this.size = this.renderer.getSize();
  this.viewport = this.gl.getParameter(this.gl.VIEWPORT);
  this.products = [];
  this.lights = [];

  var scsPassShader = {
    uniforms: {},
    vertexShader: '\
varying vec4 pos;\n\
void main() {\n\
vec4 mvPosition;\n\
mvPosition = modelViewMatrix * vec4( position, 1.0 );\n\
gl_Position = pos = projectionMatrix * mvPosition;\n\
}\n',
    fragmentShader: '\
varying vec4 pos;\n\
float calcDepth(vec4 pos) {\n\
return pos.z/pos.w;\n\
}\n\
void main() {\n\
//      gl_FragColor = vec3(0.0, 0.2, 0.0);\n\
//      gl_FragColor = vec4(0.0, 0.2, 0.0, gl_FragCoord.z); // Copy depth to .a\n\
gl_FragColor = vec4(0.0, 0.0, 0.0, calcDepth(pos)); // Copy calculated depth to .a\n\
}\n'
  };
  var idColorShader = {
    uniforms: {
      color: new THREE.Uniform('c', new THREE.Color(0.8,1.0,0.8)).onUpdate(function(object, camera) {
	this.value.setHex(object.userData.id);
      })
    },
    vertexShader: '\
varying vec4 pos;\n\
void main() {\n\
  vec4 mvPosition;\n\
  mvPosition = modelViewMatrix * vec4( position, 1.0 );\n\
  gl_Position = pos = projectionMatrix * mvPosition;\n\
}\n',
    fragmentShader: '\
uniform vec3 color;\n\
void main() {\n\
  gl_FragColor = vec4(color.xyz, 1);\n\
}\n'
  };

  var idMergeShader = {
    uniforms: {
      idtexture: {type: 't'},
      screenSize: {type: '2f'},
       objectID: new THREE.Uniform('c', new THREE.Color()).onUpdate(function(object, camera) {
	this.value.setHex(object.userData.id);
      })
    },
    vertexShader: '\
varying vec4 pos;\n\
void main() {\n\
  vec4 mvPosition;\n\
  mvPosition = modelViewMatrix * vec4( position, 1.0 );\n\
  gl_Position = pos = projectionMatrix * mvPosition;\n\
}\n',
    fragmentShader: '\
uniform vec2 screenSize;\n\
uniform sampler2D idtexture;\n\
uniform vec3 objectID;\n\
void main() {\n\
vec2 ndc = vec2(gl_FragCoord.x/screenSize[0], gl_FragCoord.y/screenSize[1]);\n\
vec4 texval = texture2D(idtexture, ndc);\n\
vec3 tmp = texval.rgb - objectID;\n\
float diff = length(tmp);\n\
if (diff < 0.2) {\n\
//  gl_FragColor = vec4(texval.rgb, 1);\n\
//  gl_FragColor = vec4(tmp, 1);\n\
  gl_FragColor = vec4(objectID, 1);\n\
}\n\
else {\n\
  discard;\n\
}\n\
//gl_FragColor = vec4(objectID.xyz, 1);\n\
}'
  };

	/*
	 How gl_FragCoord.z is calculated:
	 
	 float far=gl_DepthRange.far; float near=gl_DepthRange.near;
	 
	 vec4 eye_space_pos = gl_ModelViewMatrix * something
	vec4 clip_space_pos = gl_ProjectionMatrix * eye_space_pos;
	
	float ndc_depth = clip_space_pos.z / clip_space_pos.w;
	
	float depth = (((far-near) * ndc_depth) + near + far) / 2.0;
	gl_FragDepth = depth;
	*/

  var mergeObjectsShader = {
    uniforms: {
      merged: {type: 't'},
      viewSize: {type: '2f'}
    },
    vertexShader: '\
varying vec4 pos;\n\
void main() {\n\
vec4 mvPosition;\n\
mvPosition = modelViewMatrix * vec4( position, 1.0 );\n\
gl_Position = pos = projectionMatrix * mvPosition;\n\
}\n',
    fragmentShader: '\
uniform sampler2D merged;\n\
uniform vec2 viewSize;\n\
varying vec4 pos;\n\
float calcDepth(vec4 pos) {\n\
return pos.z/pos.w;\n\
}\n\
		void main() {\n\
vec2 coord = gl_FragCoord.xy / viewSize;\n\
vec4 texval = texture2D(merged, coord);\n\
//      if (gl_FragCoord.z == texval.a) {\n\
if (calcDepth(pos) == texval.a) {\n\
//      if (abs(calcDepth(pos) - texval.a) < 0.0001) {\n\
//      if (calcDepth(pos) <= texval.a) {\n\
gl_FragColor = vec4(texval.rgb, 1);\n\
}\n\
else discard;\n\
}\n'
  };

  var clipshader = {
    uniforms: {},
    vertexShader: '\
void main() {\n\
gl_Position = vec4(position.xyz, 1);\n\
}\n',
    fragmentShader: '\
void main() {\n\
gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);\n\
}\n'
  };

  var mergeshader = {
    uniforms: {
      src: {type: 't'},
      srcdepth: {type: 't'},
      prev: {type: 't'}
    },
    vertexShader: '\n\
varying vec2 coord;\n\
void main() {\n\
  coord = uv.xy;\n\
  gl_Position = vec4(position.xy, 0, 1);\n\
}\n',
    fragmentShader: '\n\
uniform sampler2D src;\n\
uniform sampler2D srcdepth;\n\
uniform sampler2D prev;\n\
varying vec2 coord;\n\
void main() {\n\
  vec4 srcfrag = texture2D(src, coord);\n\
  vec4 prevfrag = texture2D(prev, coord);\n\
  // float srcd = texture2D(srcdepth, coord).r;\n\
  float srcd = srcfrag.a;\n\
  // gl_FragColor = (srcd <= prevfrag.a) ? vec4(srcfrag.rgb, srcd) : prevfrag;\n\
  gl_FragColor = (srcd - 0.000001) < prevfrag.a ? vec4(srcfrag.rgb, srcd) : prevfrag;\n\
}\n'
	};

  this.scsPassMaterial = new THREE.ShaderMaterial( {
    blending: THREE.NoBlending,
    uniforms: scsPassShader.uniforms,
    vertexShader: scsPassShader.vertexShader,
    fragmentShader: scsPassShader.fragmentShader
  } );

  this.idMergeMaterial = new THREE.ShaderMaterial( {
    blending: THREE.NoBlending,
    uniforms: idMergeShader.uniforms,
    vertexShader: idMergeShader.vertexShader,
    fragmentShader: idMergeShader.fragmentShader
  } );

  this.idColorMaterial = new THREE.ShaderMaterial( {
    blending: THREE.NoBlending,
    uniforms: idColorShader.uniforms,
    vertexShader: idColorShader.vertexShader,
    fragmentShader: idColorShader.fragmentShader
  } );
  
  this.mergeObjectsMaterial = new THREE.ShaderMaterial( {
    uniforms: mergeObjectsShader.uniforms,
    vertexShader: mergeObjectsShader.vertexShader,
    fragmentShader: mergeObjectsShader.fragmentShader
  } );
  
  this.clipScene = SCSRenderer.createQuadScene(clipshader);
  this.mergeScene = SCSRenderer.createQuadScene(mergeshader);
  this.quadCamera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0, 1 );
  
  this.setupTextureResources();
}

SCSRenderer.prototype = {

    constructor: SCSRenderer,

  // FIXME: Who is responsible for freeing old resources?
  setupTextureResources: function() {
    // Setup two temporary RGBA float textures for accumulating product depths and color buffers
    this.desttextures = [];
    for (var i=0;i<2;i++) {
      this.desttextures[i] = new THREE.WebGLRenderTarget(this.size.width, this.size.height, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        depthBuffer: false,
        stencilBuffer: false
      });
    }
    
    var texparams = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType
    };
    // The depth Texture is currently only used for debugging
    if (false) {
      this.depthTexture = new THREE.DepthTexture(this.size.width, this.size.height, true);
      texparams.depth = this.depthTexture;
    }
    this.csgTexture = new THREE.WebGLRenderTarget(this.size.width, this.size.height, texparams);
  },

/*!
  Renders the intersections of a product into the depth buffer of the given renderTarget.
  The renderTarget needs to be a float texture.
  The result is a depth buffer, as well as a "synthetic" depth buffer encoded into
  the alpha channel of the renderTarget.
*/
  renderConvexIntersections: function (product, camera, renderTarget) {
    product.intersections.overrideMaterial = this.scsPassMaterial;
    //	
    // a) Draw the furthest front facing surface into z-buffer.
    //
    this.gl.colorMask(false,false,false,true);
    this.gl.depthFunc(this.gl.GREATER);
    this.gl.clearDepth(0.0);
    this.renderer.clearTarget(renderTarget, true, true, true);
    this.renderer.render(product.intersections, camera, renderTarget);
    this.gl.clearDepth(1.0);
  
    //	
    // b) Count the number of back-facing surfaces behind each pixel.
    // 
    // Count in stencil buffer, don't draw to depth or color buffers
    this.gl.depthMask(false);
    this.gl.colorMask(false,false,false,false);
    this.gl.cullFace(this.gl.FRONT);
    this.gl.enable(this.gl.STENCIL_TEST);
    this.gl.stencilFunc(this.gl.ALWAYS,0,-1);
    this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.INCR);
    
    this.renderer.render(product.intersections, camera, renderTarget);
    this.gl.cullFace(this.gl.BACK);
    
    //
    // c) Reset the z-buffer for pixels where stencil != n
    // FIXME: Also, reset stencil to zero
    // 
    this.gl.depthMask(true);
    this.gl.colorMask(false,false,false,true);
    this.gl.depthFunc(this.gl.ALWAYS);
    this.gl.stencilFunc(this.gl.NOTEQUAL,product.intersections.numObjects,-1);
    this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.KEEP);
    this.renderer.render(this.clipScene, this.quadCamera, renderTarget);
    
    this.gl.disable(this.gl.STENCIL_TEST);
    this.gl.colorMask(true, true, true, true);
    this.gl.depthFunc(this.gl.LEQUAL);
    delete product.intersections.overrideMaterial;
  },

  renderSceneToFramebuffer: function(scene, camera) {
    this.renderer.setRenderTarget(null); // Render to screen
    this.renderer.render(scene, camera);
  },

  renderSceneDepthToTexture: function (scene, renderTarget, camera) {
    scene.overrideMaterial = this.scsPassMaterial;

    this.gl.colorMask(false,false,false,true);
    // We need to clear alpha to 1 for synthetic Z buffer
    // This is not necessary when we render multiple intersections since we 
    // manually reset the unused z buffer to 1 in that case
    this.gl.clearColor(0,0,0,1);
    this.renderer.clearTarget(renderTarget, true, true, true);
    this.renderer.render(scene, camera, renderTarget);
    this.gl.clearColor(0,0,0,0);

    this.gl.colorMask(true, true, true, true);
    delete scene.overrideMaterial;
  },

/*
  Renders the subtractions of a procuct into the renderTarget.
  The rendertarget is assumed to have an attached depth buffer containing
  the intersections of the product.
  The result is still a depth buffer as well as a "synthetic" depth buffer encoded
  into the alpha channel of the renderTarget
*/
  renderConvexSubtractions: function (product, camera, renderTarget)
  {
    product.differences.overrideMaterial = this.scsPassMaterial;
    
    this.renderer.clearTarget(renderTarget, false, false, true);
    
    this.gl.colorMask(false,false,false,true);
    
    this.renderer.setRenderTarget(renderTarget); // To get correct stencil bits
    var stencilBits = this.gl.getParameter(this.gl.STENCIL_BITS);
    var stencilMask = (1 << stencilBits) - 1;
    var stencilCode = 0;
    
//    console.log("renderConvexSubtractions: " + stencilBits + " stencil bits");
    
    // a) Mark all front facing fragments - this is where negative parts can show through
    this.gl.enable(this.gl.STENCIL_TEST);
    
    var difference_objects = product.differences.children[0].children;
    difference_objects.forEach(function(obj) { obj.visible = false; });
    
    // This creates a worst-case (N^2) subtraction sequence
    // Optimizations:
    // o Batch primitives which don't overlap in screen-space
    for (var j=0;j<difference_objects.length;j++) 
      for (var i=0;i<difference_objects.length;i++) {
        difference_objects[i].visible = true;
        
        stencilCode++;
        
        this.gl.depthMask(false);
        this.gl.colorMask(false,false,false,false);
        this.gl.stencilFunc(this.gl.ALWAYS, stencilCode, -1);
        this.gl.stencilOp(this.gl.KEEP, this.gl.KEEP, this.gl.REPLACE);
        this.renderer.render(product.differences, camera, renderTarget);
        
        // b) Render back faces clipped against marked area
        this.gl.cullFace(this.gl.FRONT);
        this.gl.depthFunc(this.gl.GEQUAL);
        this.gl.depthMask(true);
        this.gl.colorMask(false,false,false,true);
        this.gl.stencilFunc(this.gl.EQUAL, stencilCode, -1);
        this.gl.stencilOp(this.gl.KEEP, this.gl.KEEP, this.gl.KEEP);
        this.renderer.render(product.differences, camera, renderTarget);
        
        this.gl.depthFunc(this.gl.LEQUAL);
        this.gl.cullFace(this.gl.BACK);
        
        difference_objects[i].visible = false;
      }
    difference_objects.forEach(function(obj) { obj.visible = true; });
    
    this.gl.disable(this.gl.STENCIL_TEST);
    this.gl.colorMask(true, true, true, true);
    delete product.differences.overrideMaterial;
  },

/*!
  Cuts out areas where subtracted parts of the product caused transparent ares.
  The result is still a depth buffer as well as a "synthetic" depth buffer encoded
  into the alpha channel of the renderTarget
*/
  renderClipZBuffer: function (product, camera, renderTarget)
  {
    // FIXME: Do we need to render this when we have no subtractions?

    product.intersections.overrideMaterial = this.scsPassMaterial;
    
    //
    // a) Mark areas where we can see the backfaces
    // 
    this.gl.colorMask(false,false,false,false);
    this.gl.depthMask(false);
    this.gl.cullFace(this.gl.FRONT);
    this.gl.depthFunc(this.gl.LESS);
    this.gl.enable(this.gl.STENCIL_TEST);
    this.gl.stencilFunc(this.gl.ALWAYS,1,-1);
    this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.REPLACE);
    
    this.renderer.clearTarget(renderTarget, false, false, true);
    // Draw all intersected objects
    this.renderer.render(product.intersections, camera, renderTarget);
    
    // 
    // b) Reset see-through pixels
    // 
    this.gl.depthMask(true);
    this.gl.colorMask(false,false,false,true);
    this.gl.depthFunc(this.gl.ALWAYS);
    this.gl.cullFace(this.gl.BACK);
    this.gl.stencilFunc(this.gl.EQUAL,1,-1);
    this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.KEEP);
    this.renderer.render(this.clipScene, this.quadCamera, renderTarget);
    
    this.gl.disable(this.gl.STENCIL_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);
    this.gl.colorMask(true,true,true,true);
    delete product.intersections.overrideMaterial;
  },

/*!
 Use the current z buffer for depth equality test of incoming fragments.
 The z buffer should represent a merged depth buffer.

 Uses real shader materials, but masks away the alpha channel as we're using it 
 to store our synthetic depth buffer.

 The result is a correct color channel for the product. The depth
 buffer and synthetic depth buffer stays unchanged.
*/
  renderLightingUsingZBuffer: function(product, camera, renderTarget) {
    this.gl.depthFunc(this.gl.EQUAL);
    this.gl.colorMask(true,true,true,false);
    this.renderer.render(product.intersections, camera, renderTarget);
    if (product.differences) {
      this.gl.cullFace(this.gl.FRONT);
      this.renderer.render(product.differences, camera, renderTarget);
    }
    this.gl.cullFace(this.gl.BACK);
    this.gl.colorMask(true,true,true,true);
    this.gl.depthFunc(this.gl.LEQUAL);
  },

/*!
  Merges a renderTarget and a previously merged buffer into a destination buffer.

  renderTarget: float RGBA + depth attachment (A is synthetic depth)
  prev/dest: float RGBA (A is synthetic depth)

  Since we use the alpha channel as a synthetic depth buffer, we need
  float textures for all buffers.
*/
  mergeBuffers: function(src, prev, dest) {
    
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.BLEND);
    this.mergeScene.shaderMaterial.uniforms.src.value = src;
    this.mergeScene.shaderMaterial.uniforms.srcdepth.value = src.depthTexture;
    this.mergeScene.shaderMaterial.uniforms.prev.value = prev;
    this.renderer.render(this.mergeScene, this.quadCamera, dest);
    this.gl.enable(this.gl.DEPTH_TEST);
  },

/*!
  Takes a merged color buffer with a synthetic depth buffer encoded
  into the alpha channel and renders into the framebuffer, providing actual Z
  values from all products.

  This is necessary to enable rendering of other primitives into the
  scene later on.
*/
  mergeObjectsWithTexture: function(camera, texture) {
    this.renderer.setRenderTarget(null); // Render to screen
    
    this.gl.depthFunc(this.gl.ALWAYS);
    this.mergeObjectsMaterial.uniforms.merged.value = texture;
    this.mergeObjectsMaterial.uniforms.viewSize.value = [this.size.width, this.size.height];
    for (var i=0;i<this.products.length;i++) {
      var product = this.products[i];
      product.intersections.overrideMaterial = this.mergeObjectsMaterial;
      this.renderer.render(product.intersections, camera);
      if (product.differences) {
        this.gl.cullFace(this.gl.FRONT);
        product.differences.overrideMaterial = this.mergeObjectsMaterial;
        this.renderer.render(product.differences, camera);
        delete product.differences.overrideMaterial;
      }
      this.gl.cullFace(this.gl.BACK);
      delete product.intersections.overrideMaterial;
    }
    this.gl.depthFunc(this.gl.LESS);
  },

  mergeProductWithTexture: function(product, camera, texture) {
    this.renderer.setRenderTarget(null); // Render to screen
    
    this.mergeObjectsMaterial.uniforms.merged.value = texture;
    this.mergeObjectsMaterial.uniforms.viewSize.value = [this.size.width, this.size.height];
    product.intersections.overrideMaterial = this.mergeObjectsMaterial;
    this.renderer.render(product.intersections, camera);
    if (product.differences) {
      this.gl.cullFace(this.gl.FRONT);
      product.differences.overrideMaterial = this.mergeObjectsMaterial;
      this.renderer.render(product.differences, camera);
      delete product.differences.overrideMaterial;
    }
    this.gl.cullFace(this.gl.BACK);
    delete product.intersections.overrideMaterial;
  },

  renderWithRealZBuffer: function(camera, options) 
  {
    if (options.useIDColors) {
      this.renderWithIDColors(camera);
    }
    else if (options.optimizeMerges) {
      this.renderWithOptimizeMerges(camera);
    }
    else {
      this.renderWithRealZBufferClassic(camera);
    }
  },
  
  renderProductToTexture: function(product, texture, camera) 
  {
    if (product.intersections.numObjects > 1) {
      this.renderConvexIntersections(product, camera, texture);
    }
    else {
      // Optimization: Just render the object depth without clipping or stencils
      this.renderSceneDepthToTexture(product.intersections, texture, camera);
    }
    if (product.differences && product.differences.numObjects > 0) { // Skip if we only have positives
      this.renderConvexSubtractions(product, camera, texture);
      this.renderClipZBuffer(product, camera, texture);
    }
    this.renderLightingUsingZBuffer(product, camera, texture);
  },

  renderWithOptimizeMerges: function(camera, options) 
  {
    // FIXME: Only if necessary
    for (var i=0;i<2;i++) {
      // Init alpha with 1 since we're using alpha to emulate a depth buffer
      this.gl.clearColor(0,0,0,1);
      this.renderer.clearTarget(this.desttextures[0]);
      this.gl.clearColor(0,0,0,0);
    }
    
    this.renderer.clearTarget(this.csgTexture, true, false, false);
    for (var i=0;i<this.products.length;i++) {
      var product = this.products[i]
      if (!product.differences && product.intersections.numObjects === 1) {
        this.renderSceneToFramebuffer(product.intersections, camera);
      }
      else {
        this.renderProductToTexture(product, this.csgTexture, camera)
        this.mergeProductWithTexture(product, camera, this.csgTexture);
      }
    }
  },

  renderWithRealZBufferClassic: function(camera, options) 
  {
    // FIXME: Only if necessary
    for (var i=0;i<2;i++) {
      // Init alpha with 1 since we're using alpha to emulate a depth buffer
      this.gl.clearColor(0,0,0,1);
      this.renderer.clearTarget(this.desttextures[0]);
      this.gl.clearColor(0,0,0,0);
    }
    
    this.renderer.clearTarget(this.csgTexture, true, false, false);
    for (var i=0;i<this.products.length;i++) {
      var product = this.products[i];
      this.renderProductToTexture(product, this.csgTexture, camera)
      this.mergeBuffers(this.csgTexture, this.desttextures[i%2], this.desttextures[(i+1)%2]);
    }
    
    var currdesttexture = this.products.length%2;
    //	this.renderer.clearTarget(this.csgTexture, true, true, true);
    
    //  showRGBTexture(this.desttextures[1], [0,0], [window.innerWidth, window.innerHeight]);
    if (this.debug) {
//      showRGBTexture(this.desttextures[currdesttexture], [-256,-256*window.innerHeight/window.innerWidth]);
//      showRGBTexture(this.desttextures[(currdesttexture+1)%2], [-256,-512*window.innerHeight/window.innerWidth]);
//      showRGBTexture(scsRenderer.csgTexture, [-256,-768*window.innerHeight/window.innerWidth]);
//      showAlpha(this.desttextures[currdesttexture], [-500,-256*window.innerHeight/window.innerWidth]);
//      showAlpha(this.desttextures[(currdesttexture+1)%2], [-500,-512*window.innerHeight/window.innerWidth]);
//      showAlpha(this.desttextures[scsRenderer.csgTexture], [-500,-768*window.innerHeight/window.innerWidth]);
    }
    
    this.mergeObjectsWithTexture(camera, this.desttextures[currdesttexture]);
  },

  renderWithIDColors: function(camera, options) 
  {
    this.renderer.clearTarget(this.csgTexture);
    for (var i=0;i<this.products.length;i++) {
      var product = this.products[i];
      this.renderProductDepthAndIDColors(product, camera, this.csgTexture)
      this.mergeID(product, camera, this.csgTexture);
    }
    
    if (this.debug) {
//      showRGBTexture(scsRenderer.csgTexture, [-256,-768*window.innerHeight/window.innerWidth]);
    }
    
    this.finalRenderUsingID(camera);
  },

  /*
    Input: product and camera
    Output (target): 
    * depth: Depth buffer representing the product
    * color: ID color for each intersection or subtraction component representing the depth value    
   */
  renderProductDepthAndIDColors: function(product, camera, target) 
  {
    this.renderConvexIntersectionsID(product, camera, target);
    if (product.differences && product.differences.numObjects > 0) { // Skip if we only have positives
      this.renderConvexSubtractionsID(product, camera, target);
      this.renderClipZBufferID(product, camera, target);
    }
  },

  /*!
    Renders the intersections of a product into the given target.

    Output (target):
    * Will clear target first
    * depth: Depth buffer representing the intersections
    * color: ID color for each intersection component representing the depth value    
  */
  renderConvexIntersectionsID: function (product, camera, target) {
    product.intersections.overrideMaterial = this.idColorMaterial;
    //	
    // a) Draw the furthest front facing surface into z-buffer, render ID color into color buffer
    //
    this.gl.depthFunc(this.gl.GREATER);
    this.gl.clearDepth(0.0);
    this.renderer.clearTarget(target, true, true, true);
    this.renderer.render(product.intersections, camera, target);
    this.gl.clearDepth(1.0);

    // Optimization: We we've got only one intersection, there is no need to perform clipping
    if (product.intersections.numObjects > 1) {
      //	
      // b) Count the number of back-facing surfaces behind each pixel.
      // 
      // Count in stencil buffer, don't draw to depth or color buffers
      this.gl.depthMask(false);
      this.gl.colorMask(false,false,false,false);
      this.gl.cullFace(this.gl.FRONT);
      this.gl.enable(this.gl.STENCIL_TEST);
      this.gl.stencilFunc(this.gl.ALWAYS,0,-1);
      this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.INCR);
      
      this.renderer.render(product.intersections, camera, target);
      this.gl.cullFace(this.gl.BACK);
      
      //
      // c) Reset the z-buffer and color buffer for pixels where stencil != n
      // FIXME: Also, reset stencil to zero?
      // 
      this.gl.depthMask(true);
      this.gl.colorMask(true,true,true,true);
      this.gl.depthFunc(this.gl.ALWAYS);
      this.gl.stencilFunc(this.gl.NOTEQUAL,product.intersections.numObjects,-1);
      this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.KEEP);
      this.renderer.render(this.clipScene, this.quadCamera, target);
      
      this.gl.disable(this.gl.STENCIL_TEST);
      this.gl.colorMask(true, true, true, true);
    }

    this.gl.depthFunc(this.gl.LEQUAL);

    delete product.intersections.overrideMaterial;
  },
  
  /*!
    Renders the subtractions of a product into the given target.

    Output (target):
    * depth: Depth buffer representing the subtractions
    * color: ID color for each intersection component representing the depth value    
  */
  renderConvexSubtractionsID: function (product, camera, target)
  {
    product.differences.overrideMaterial = this.idColorMaterial;
    
    this.renderer.clearTarget(target, false, false, true);
    
    this.renderer.setRenderTarget(target); // To get correct stencil bits
    var stencilBits = this.gl.getParameter(this.gl.STENCIL_BITS);
    var stencilMask = (1 << stencilBits) - 1;
    var stencilCode = 0;
    
//    console.log("renderConvexSubtractions: " + stencilBits + " stencil bits");
    
    // a) Mark all front facing fragments - this is where negative parts can show through
    this.gl.enable(this.gl.STENCIL_TEST);
    
    var difference_objects = product.differences.children[0].children;
    difference_objects.forEach(function(obj) { obj.visible = false; });
    
    // This creates a worst-case (N^2) subtraction sequence
    // Optimizations:
    // o Batch primitives which don't overlap in screen-space
    for (var j=0;j<difference_objects.length;j++) 
      for (var i=0;i<difference_objects.length;i++) {
        difference_objects[i].visible = true;
        
        stencilCode++;
        
        this.gl.depthMask(false);
        this.gl.colorMask(false,false,false,false);
        this.gl.stencilFunc(this.gl.ALWAYS, stencilCode, -1);
        this.gl.stencilOp(this.gl.KEEP, this.gl.KEEP, this.gl.REPLACE);
        this.renderer.render(product.differences, camera, target);
        
        // b) Render back faces clipped against marked area
        this.gl.cullFace(this.gl.FRONT);
        this.gl.depthFunc(this.gl.GEQUAL);
        this.gl.depthMask(true);
        this.gl.colorMask(true,true,true,true);
        this.gl.stencilFunc(this.gl.EQUAL, stencilCode, -1);
        this.gl.stencilOp(this.gl.KEEP, this.gl.KEEP, this.gl.KEEP);
        this.renderer.render(product.differences, camera, target);
        
        this.gl.depthFunc(this.gl.LEQUAL);
        this.gl.cullFace(this.gl.BACK);
        
        difference_objects[i].visible = false;
      }
    difference_objects.forEach(function(obj) { obj.visible = true; });
    
    this.gl.disable(this.gl.STENCIL_TEST);
    delete product.differences.overrideMaterial;
  },

  /*
    Determines where a subtraction would allow us to see through the object, and resets the
    color and depth buffer for these areas.
   */
  renderClipZBufferID: function (product, camera, target)
  {
    // FIXME: Do we need to render this when we have no subtractions?

    product.intersections.overrideMaterial = this.scsPassMaterial;
    
    //
    // a) Mark areas where we can see the backfaces
    // 
    this.gl.colorMask(false,false,false,false);
    this.gl.depthMask(false);
    this.gl.cullFace(this.gl.FRONT);
    this.gl.depthFunc(this.gl.LESS);
    this.gl.enable(this.gl.STENCIL_TEST);
    this.gl.stencilFunc(this.gl.ALWAYS,1,-1);
    this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.REPLACE);
    
    this.renderer.clearTarget(target, false, false, true);
    // Draw all intersected objects
    this.renderer.render(product.intersections, camera, target);
    
    // 
    // b) Reset see-through pixels
    // 
    this.gl.depthMask(true);
    this.gl.colorMask(true,true,true,true);
    this.gl.depthFunc(this.gl.ALWAYS);
    this.gl.cullFace(this.gl.BACK);
    this.gl.stencilFunc(this.gl.EQUAL,1,-1);
    this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.KEEP);
    this.renderer.render(this.clipScene, this.quadCamera, target);
    
    this.gl.disable(this.gl.STENCIL_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);
    delete product.intersections.overrideMaterial;
  },

  /*
    Assumes the current color and depth framebuffer contains the current ID color and depth
    values of all products processed thus far.
    The texture contains ID colors of the given product

    Re-renders the entire product, but only transfer depth values where the product ID matches
    the ID in the texture color buffer.
  */
  mergeID: function(product, camera, texture) {
    this.renderer.setRenderTarget(null); // Render to screen
    this.idMergeMaterial.uniforms.idtexture.value = texture;
    this.idMergeMaterial.uniforms.screenSize.value = [this.size.width, this.size.height];
    product.intersections.overrideMaterial = this.idMergeMaterial;
    product.differences.overrideMaterial = this.idMergeMaterial;
    this.renderer.render(product.intersections, camera);
    this.gl.cullFace(this.gl.FRONT);
    this.renderer.render(product.differences, camera);
    this.gl.cullFace(this.gl.BACK);
    delete product.intersections.overrideMaterial;
    delete product.differences.overrideMaterial;
  },

  /*
    Assumes a correct Z buffer for all products exists in the framebuffer.
    
    Renders all products (intersection front faces and subtraction back faces) with their
    normal materials and shaders, but with EQUAL depth test.
   */
  finalRenderUsingID: function(camera) {
    this.renderer.setRenderTarget(null); // Render to screen
    
    this.gl.depthFunc(this.gl.EQUAL);
    for (var i=0;i<this.products.length;i++) {
      var product = this.products[i];
      this.renderer.render(product.intersections, camera);
      if (product.differences) {
        this.gl.cullFace(this.gl.FRONT);
        this.renderer.render(product.differences, camera);
        this.gl.cullFace(this.gl.BACK);
      }
    }
    this.gl.depthFunc(this.gl.LESS);
  },


  setDebug: function(debugflag) {
    this.debug = debugflag;
  },

  // FIXME: For visual debugging, we're using real colors
  // To support more objects, we should generate this as increasing ID's
  // or find another way of generating lots of unique color values
  colors: [
    0xff0000,
    0x00ff00,
    0x0000ff,
    0xffff00,
    0xff0fff,
    0x00ffff,
    0x880000,
    0x008800,
    0x000088,
    0x88ff00,
    0x00ff88,
    0xff8800,
    0xff0088,
    0x8800ff,
    0x0088ff
  ],

  setScene: function(csgscene) {
    var self = this;
    var objectid = 0;
    this.products = [];
    this.transparent_objects = new THREE.Scene();
    if (csgscene.transparents) {
      this.transparent_objects.add.apply(this.transparent_objects, csgscene.transparents);
      this.lights.forEach(function(light) {
        self.transparent_objects.add(light.clone());
      });
    }
    csgscene.products.forEach(function(ch) {
      var product = {};
      product.intersections = new THREE.Scene();
      if (ch.intersections && ch.intersections.length > 0) {
        product.intersections.numObjects = ch.intersections.length;
        var group = new THREE.Group();
        ch.intersections.forEach(function(obj) {
//          obj.userData.id = objectid++;
          obj.userData.id = self.colors[objectid];
          objectid = (objectid + 1) % self.colors.length;
//          obj.userData.id = Math.random() * 0xffffff;
        });
        group.add.apply(group, ch.intersections);

        product.intersections.add(group);
        self.lights.forEach(function(light) {
	  product.intersections.add(light.clone());
        });
      }

      product.differences = new THREE.Scene();
      if (ch.differences && ch.differences.length > 0) {
        product.differences.numObjects = ch.differences.length;
        var group = new THREE.Group();

        ch.differences.forEach(function(obj) {
//          obj.userData.id = objectid++;
          obj.userData.id = self.colors[objectid];
          objectid = (objectid + 1) % self.colors.length;
//          obj.userData.id = Math.random() * 0xffffff;
        });
        group.add.apply(group, ch.differences);

        product.differences.add(group);
        self.lights.forEach(function(light) {
	  product.differences.add(light.clone());
        });
      }

      self.products.push(product);
    });
  },

  render: function(camera, options) {
    options = options || {};

    var rendererSize = this.renderer.getSize();
    if (this.size.width != rendererSize.width || this.size.height != rendererSize.height) {
      this.size = rendererSize;
      this.setupTextureResources();
    }

    this.renderWithRealZBuffer(camera, options);
  },

  addLights: function(lights) {
    this.lights = lights;
  }

};

SCSRenderer.createQuadScene = function(shader) {
  var quadMaterial = new THREE.ShaderMaterial( {
    uniforms: shader.uniforms,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader
  } );
  var quadScene = new THREE.Scene();
  var geom = new THREE.PlaneBufferGeometry( 2, 2 );
  for (var i=0;i<geom.attributes.position.array.length;i+=3) {
    geom.attributes.position.array[i+2] = 1;
  }
  quadScene.add(new THREE.Mesh( geom, quadMaterial ))
  quadScene.shaderMaterial = quadMaterial;
  return quadScene;
};

module.exports = SCSRenderer;

},{}],3:[function(require,module,exports){
var SCSRenderer = require('./SCSRenderer');
var CSGScene = require('./CSGNodes').CSGScene;

function text2html(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
function handleError(text) {
  var html = text2html(text);
  if (html == 'WebGL not supported') {
    html = 'Your browser does not support WebGL.<br>Please see\
    <a href="http://www.khronos.org/webgl/wiki/Getting_a_WebGL_Implementation">\
    Getting a WebGL Implementation</a>.';
  }
  var error = document.getElementById('error');
  error.innerHTML = html;
  error.style.zIndex = 1;
}

window.onerror = handleError;

var canvaswrapper;
var canvas;
var renderer;
var gl;
var settings = {};
var depthshader;
var texshader;
var alphashader;
var texrgbshader;
var stencilshader;
var texScene;
var texRgbScene;
var alphaScene;
var depthScene;
var stencilScene;
var quadCamera;
	
var scsRenderer;
var controls;
var camera;
var extra_objects_scene;

var csgscene;

window.onload = function() {
	
  document.body.style.backgroundColor = '#' + $("#bgcolor")[0].color.toString();
  canvaswrapper = document.getElementById('canvaswrapper');
  canvas = document.getElementById('canvas');

  renderer = new THREE.WebGLRenderer({canvas: canvas, alpha: true});
  gl = renderer.getContext();
  resizeCanvasToDisplaySize(true);
  var size = renderer.getSize();

  camera = new THREE.PerspectiveCamera(75, size.width / size.height, 0.5, 1000);
  camera.position.z = 50;

  controls = new THREE.TrackballControls(camera, canvaswrapper);
  controls.rotateSpeed = 3.0;
  controls.panSpeed = 2.0;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0.1;
  controls.addEventListener('change', render);

  canvaswrapper.addEventListener('click', function(e) {
    var mouse = {};
    mouse.x = 2 * (e.clientX / canvaswrapper.clientWidth) - 1;
    mouse.y = 1 - 2 * (e.clientY / canvaswrapper.clientHeight);
    console.log("click: " + mouse.x + "," + mouse.y);
    rayPick(mouse);
  }, false);
  
  // create a point light
  var pointLight = new THREE.PointLight(0xFFFFFF);
  pointLight.position.x = 10;
  pointLight.position.y = 50;
  pointLight.position.z = 130;
  
  var light2 = new THREE.DirectionalLight(0xFFFFFF);
  light2.position.x = 100;
  light2.position.y = -50;
  light2.position.z = -130;
  light2.target.x = 0;
  light2.target.y = 0;
  light2.target.z = 0;
  
  scsRenderer = new SCSRenderer(renderer);
  scsRenderer.addLights([pointLight, light2]);

  depthshader = {
    uniforms: {dtexture: {type: 't'}},
    vertexShader: '\
varying vec2 coord;\n\
void main() {\n\
coord = uv.xy;\n\
gl_Position = vec4(position.xy, 0, 1);\n\
}\n\
',
    fragmentShader: '\
uniform sampler2D dtexture;\n\
varying vec2 coord;\n\
void main() {\n\
float z = texture2D(dtexture, coord).r;\n\
float n = 0.7;\n\
float f = 1.0;\n\
float c = (z-n)/(f-n);\n\
gl_FragColor.rgba = vec4(vec3(1.0-c), c == 1.0 ? 0.0 : 1.0);\n\
}\n'
	};
	
  texshader = {
    uniforms: {texture: {type: 't'}},
    vertexShader: '\
varying vec2 coord;\n\
void main() {\n\
coord = uv.xy;\n\
gl_Position = vec4(position.xy, 0, 1);\n\
}\n\
',
    fragmentShader: '\
uniform sampler2D texture;\n\
varying vec2 coord;\n\
void main() {\n\
gl_FragColor = texture2D(texture, coord);\n\
}\n'
  };
	
  alphashader = {
    uniforms: {texture: {type: 't'}},
    vertexShader: '\n\
varying vec2 coord;\n\
void main() {\n\
coord = uv.xy;\n\
gl_Position = vec4(position.xy, 0, 1);\n\
}\n',
    fragmentShader: '\n\
uniform sampler2D texture;\n\
varying vec2 coord;\n\
void main() {\n\
float z = texture2D(texture, coord).a;\n\
float n = 0.0;\n\
float f = 1.0;\n\
float c = (z-n)/(f-n);\n\
gl_FragColor.rgba = vec4(vec3(1.0-c), c == 1.0 ? 0.0 : 1.0);\n\
}\n'
  };
  
  texrgbshader = {
    uniforms: {texture: {type: 't'}},
    vertexShader: '\n\
varying vec2 coord;\n\
void main() {\n\
coord = uv.xy;\n\
gl_Position = vec4(position.xy, 0, 1);\n\
}\n',
    fragmentShader: '\n\
uniform sampler2D texture;\n\
varying vec2 coord;\n\
void main() {\n\
vec3 col = texture2D(texture, coord).rgb;\n\
float alpha = (col == vec3(0,0,0)) ? 0.0 : 1.0;\n\
gl_FragColor.rgba = vec4(col, alpha);\n\
}\n'
  };
  
  stencilshader = {
    uniforms: {col: {type: '3f'}},
    vertexShader: '\n\
uniform vec3 col;\n\
void main() {\n\
gl_Position = vec4(position.xy, 0, 1);\n\
}\n\
',
    fragmentShader: '\n\
uniform vec3 col;\n\
void main() {\n\
gl_FragColor = vec4(col, 1);\n\
}\n\
'};
	
  texScene = SCSRenderer.createQuadScene(texshader);
  texRgbScene = SCSRenderer.createQuadScene(texrgbshader);
  alphaScene = SCSRenderer.createQuadScene(alphashader);
  depthScene = SCSRenderer.createQuadScene(depthshader);
  stencilScene = SCSRenderer.createQuadScene(stencilshader);
  quadCamera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0, 1 );
  
  extra_objects_scene = createTestScene();

  settings.debug = document.getElementById('debug').checked;

  document.getElementById('renderermenu').addEventListener('change', function(event) {
    applySettings(event.target.value);
  });
  applySettings(document.getElementById('renderermenu').value);

  document.getElementById('menu').addEventListener('change', function(event) {
    loadModel(event.target.value);
  });

  document.getElementById('debug').addEventListener('change', function(event) {
    settings.debug = event.target.checked;
    render();
  });

  document.getElementById('extra_objects').addEventListener('change', function(event) {
    settings.extraObjects = event.target.checked;
    render();
  });

  window.addEventListener('resize', render);

  loadModel(document.getElementById('menu').value);

  animate();
}

var currentPick;
var currentPickMaterial;
var selectionMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
function rayPick(mouse) {
  var pickedmesh = csgscene.pick(mouse, camera);

  // Keep track of original properties of selected mesh
  if (currentPick) {
    currentPick.meshes.forEach(function(mesh) {
      mesh.material = currentPickMaterial;
    });
  }

  if (pickedmesh && pickedmesh.csgleaf) {
    console.log("Found Leaf!");
    currentPick = pickedmesh.csgleaf;
  }
  else {
    currentPick = undefined;
  }

  if (currentPick) {
    if (currentPick.csgleaf) console.log("Found Leaf!");

    // FIXME:
    // The currentPick mesh represents a CSGLeaf (but not when reading from JSON)
    // Multiple meshes can represent the same CSGLeaf, but when rendering
    // meshes, we only look at matching depth values, so we don't know which
    // one actually represents the mesh we should draw. Since the materials are almost always
    // (see e.g. https://github.com/openscad/openscad/issues/1000 for an example)
    // the same, it doesn't matter, except that it makes rendering selection highlights harder.
    // We fix this by selecting all meshes originating from the same CSGLeaf
    // 
    currentPickMaterial = pickedmesh.material;
    currentPick.meshes.forEach(function(mesh) {
      mesh.material = selectionMaterial;
    });
  }
  render();
  // FIXME: Map from Object3D to CSGLeaf instance
  // OpenSCAD Node: csgleaf.geometry
  // Select in AST and source code
}

function setupWindowViewport(pos, size, canvassize) {
  size = size || [256,0];
  if (!size[0]) size[0] = size[1] * canvassize.width/canvassize.height;
  if (!size[1]) size[1] = size[0] * canvassize.height/canvassize.width;
  pos = pos || [window.innerWidth - size[0], 0];
  if (pos[0] < 0) pos[0] += canvassize.width;
  if (pos[1] < 0) pos[1] += canvassize.height;
  renderer.setViewport(pos[0], pos[1], size[0], size[1]);
}

/*
 Renders the given texture without alpha in a window for debugging
*/
function showRGBTexture(texture, pos, size) {
  renderer.setRenderTarget(null); // Render to screen
  var canvassize = renderer.getSize();
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size, canvassize);
	
  gl.disable(gl.DEPTH_TEST);
	
  texRgbScene.shaderMaterial.uniforms.texture.value = texture;
  renderer.render(texRgbScene, quadCamera);
	
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(v[0], v[1], v[2], v[3]);
}

/*
 Renders the given texture in a window for debugging
*/
function showTexture(texture, pos, size) {
  renderer.setRenderTarget(null); // Render to screen
  var canvassize = renderer.getSize();
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size, canvassize);
  
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	
  texScene.shaderMaterial.uniforms.texture.value = texture;
  renderer.render(texScene, quadCamera);
	
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(v[0], v[1], v[2], v[3]);
}

/*!
 Renders the alpha component of the given texture as visible pixels for debugging.
*/
function showAlpha(texture, pos, size) {
  renderer.setRenderTarget(null); // Render to screen
  var canvassize = renderer.getSize();
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size, canvassize);
  
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
	
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  alphaScene.shaderMaterial.uniforms.texture.value = texture;
  renderer.render(alphaScene, quadCamera);
  gl.disable(gl.BLEND);
	
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(v[0], v[1], v[2], v[3]);
}

/*!
 Renders the depth buffer of the given texture in a window for debugging.
 Znear is white, Zfar is black
*/
function showDepthBuffer(texture, pos, size) {
  renderer.setRenderTarget(null); // Render to screen
  var canvassize = renderer.getSize();
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size, canvassize);
  
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  
  depthScene.shaderMaterial.uniforms.dtexture.value = texture;
  renderer.render(depthScene, quadCamera);
	
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);

  gl.viewport(v[0], v[1], v[2], v[3]);
}

/*!
  Clears a portion of the viewport (color only)
*/
function clearViewport(pos, size) {
  renderer.setRenderTarget(null); // Render to screen
  var canvassize = renderer.getSize();
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size, canvassize);
  
  renderer.clear();

  gl.viewport(v[0], v[1], v[2], v[3]);
}

/*!
 Renders the stencil buffer of the given render target in a window for debugging.
 The render target must have a depth attachment.
 Each stencil bit is rendered in a different color.
 The render target's color buffer will be overwritten
*/
function showStencilBuffer(target, pos, size) {
  renderer.setRenderTarget(null); // Render to screen
  var canvassize = renderer.getSize();
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size, canvassize);
  
  var colors = [[1,0,0],[0,1,0],[0,0,1],[1,1,0]];
  
  gl.depthMask(false);
  renderer.clearTarget(target, true, true, false);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.STENCIL_TEST);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  for (var i=0;i<colors.length;i++) {
    gl.stencilFunc(gl.EQUAL, i+1, -1);
    stencilScene.shaderMaterial.uniforms.col.value = colors[i%colors.length];
    renderer.render(stencilScene, quadCamera, target);
  }
  
  gl.disable(gl.STENCIL_TEST);
  gl.depthMask(true);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  
  texScene.shaderMaterial.uniforms.texture.value = target;
  renderer.render(texScene, quadCamera);
  
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  
  gl.viewport(v[0], v[1], v[2], v[3]);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
}

function createTestScene() {
  var scene = new THREE.Scene;
  var pointLight = new THREE.PointLight(0xFFFFFF);
  pointLight.position.x = 10;
  pointLight.position.y = 50;
  pointLight.position.z = 130;
  scene.add(pointLight);
  var material = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
  var boxmesh = new THREE.Mesh(new THREE.BoxGeometry(100,7,7), material);
  boxmesh.translateX(15);
  boxmesh.translateY(15);
  scene.add(boxmesh);
  return scene;
}

function render() {

  resizeCanvasToDisplaySize();
  var size = renderer.getSize();

  renderer.setRenderTarget(null); // Render to screen
  renderer.autoClear = false;
  setupWindowViewport([0,0], [size.width, size.height], size);
  var v = gl.getParameter(gl.VIEWPORT);
  gl.clearColor(0,0,0,0);
  renderer.clear();

  
  scsRenderer.render(camera, settings.rendering);
  
  if (settings.extraObjects) {
    renderer.render(extra_objects_scene, camera);
  }
  renderer.render(scsRenderer.transparent_objects, camera);
  
  if (settings.debug) {
    // Show texture in a window
    showRGBTexture(scsRenderer.csgTexture, [0, 512*gl.canvas.height/gl.canvas.width]);
    
    // Render depth buffer in a window for debugging
//    showDepthBuffer(scsRenderer.depthTexture, [0,0]);
//    showAlpha(scsRenderer.csgTexture, [100,0]);
    
//    showAlpha(scsRenderer.desttextures[0], [0,-256*gl.canvas.height/gl.canvas.width]);
//    showAlpha(scsRenderer.desttextures[1], [100,-256*gl.canvas.height/gl.canvas.width]);
    
    // Render stencil buffer in a window for debugging
//    showStencilBuffer(scsRenderer.csgTexture, [0,256*gl.canvas.height/gl.canvas.width]);
  }
}

function loadModel(filename) {
  csgscene = new CSGScene();
  csgscene.load(filename, function() {
    console.log('Loaded ' + filename);
    scsRenderer.setScene(csgscene);
    render();
  });
}

function applySettings(str) {
  settings.rendering = {};
  var obj = eval("(" + str + ")");
  for (var s in obj) {
    if (obj.hasOwnProperty(s)) settings.rendering[s] = obj[s];
  }
}

function resizeCanvasToDisplaySize(force) {
  // Inherit width from parent
  var width = canvaswrapper.clientWidth;
  var height = canvaswrapper.clientHeight;
  if (force || canvas.width != width || canvas.height != height) {
    // Will update canvas size and gl.viewport
    renderer.setSize(width, height, true);
    if (camera) {
      camera.aspect = width/height;
      camera.updateProjectionMatrix();
    }
    if (controls) {
      controls.handleResize();
    }
  }
}

},{"./CSGNodes":1,"./SCSRenderer":2}]},{},[3,1,2]);
