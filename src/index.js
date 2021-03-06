import setup_css_vars       from './css_vars.js'
import * as all_settings    from './settings.js'
import GPUComputeProgram    from './shaderCompute/gpuComputeProgram.js'
import {create_output_pass} from './shaderCompute/outputTextureRect.js'
import velocity_pass        from './passes/velocityPass.js'
import position_pass        from './passes/positionPass.js'
import excrete_pass         from './passes/excretePass.js'
import render_pass          from './passes/renderPass.js'


import {
  TextureLoader,
  WebGLRenderer,
  Scene,
  OrthographicCamera
}from 'three'

(function(){

  setup_css_vars();
  document.addEventListener("DOMContentLoaded", start);

  let running = false;
  let gpu_compute_prog;
  let renderer;
  let settings = all_settings.high;
  let menu_open = false;
  let selected_button;

  function start(){
    renderer = set_up_threeJS();
    setup_gpu_prog();
    setup_html_listeners();
    selected_button = document.getElementById("high");
    openFullscreen();
  }

  function set_settings(preset){
    settings = all_settings[preset];
    setup_gpu_prog();
    selected_button.classList.remove("selected");
    selected_button = document.getElementById(preset)
    selected_button.classList.add("selected");
  }

  function setup_gpu_prog(){

      gpu_compute_prog = new GPUComputeProgram(renderer);
      let passes = create_passes();
      add_passes_to_gpuProg(gpu_compute_prog, passes);
      set_pass_uniforms(passes);
      set_pass_update_functions(passes);

  }


  function setup_html_listeners(){

    //quality settings buttons
    document.getElementById("low").addEventListener( "click", function(){set_settings("low");} )
    document.getElementById("medium").addEventListener( "click", function(){set_settings("medium");} )
    document.getElementById("high").addEventListener( "click", function(){set_settings("high");} )
    document.getElementById("four_k").addEventListener( "click", function(){set_settings("four_k");} )
    document.getElementById("ultra").addEventListener( "click", function(){set_settings("ultra");} )

    //menu dropdown chevron
    document.getElementById("chevron").addEventListener( "click", function(){
        animate(document.getElementById("menu"), "height", "pt", menu_open*30, (1.0-menu_open)*30, 0.1, function(){menu_open = (menu_open+1)%2;});
    });

    //hide menu on click anywhere in the renderer
    renderer.domElement.addEventListener( 'click', function(){
      if(menu_open == 1)
        animate(document.getElementById("menu"), "height", "pt", 30, 0, 0.1, function(){menu_open = 0;});
    });

  }


  function set_up_threeJS(){

    let renderer = new WebGLRenderer({ alpha: true });
    document.body.appendChild( renderer.domElement );
    //start transparent and fade in on image load
    renderer.domElement.style.opacity = 0;

    function set_window_size(){
      let w_scale = window.innerWidth/settings.render_texture_size.x;
      let h_scale = window.innerHeight/settings.render_texture_size.y;
      let scale   = Math.max(w_scale, h_scale);
      renderer.setSize( settings.render_texture_size.x*scale, settings.render_texture_size.y*scale);
      renderer.setPixelRatio( window.devicePixelRatio );
    }

    window.addEventListener("resize", set_window_size);
    set_window_size();

    return renderer;
  }


  function create_passes(){
    let passes = {};
    passes.velocity   = velocity_pass(settings);
    passes.position   = position_pass(settings);
    passes.excrete    = excrete_pass(settings);
    passes.excrete_a  = excrete_pass(settings);
    passes.render     = render_pass(settings);
    passes.output     = create_output_pass(passes.render);
    return passes;
  }


  //this is done manually instead of iterating over the keys for testing.
  //this way you can disable a pass or two when you're debugging other passes.
  //add them in the order you need them to execute.
  function add_passes_to_gpuProg(gpu_compute_prog, passes){
    gpu_compute_prog.add_pass(passes.velocity);
    gpu_compute_prog.add_pass(passes.position);
    gpu_compute_prog.add_pass(passes.excrete);
    gpu_compute_prog.add_pass(passes.excrete_a);
    gpu_compute_prog.add_pass(passes.render);
    gpu_compute_prog.add_pass(passes.output);
  }


  //link_pass_to_uniform sets the pass' sampler2D uniform to the output of another passes
  //it is necessary to constantly update this every frame due to double buffering
  //the computePass class handles this after you've linked the passes
  function set_pass_uniforms(passes){
    passes.velocity.link_pass_to_uniform("positions",  passes.position);
    passes.velocity.link_pass_to_uniform("excretions", passes.excrete);
    passes.position.link_pass_to_uniform("velocities", passes.velocity);
    passes.excrete.link_pass_to_uniform("positions",   passes.position);
    passes.excrete_a.link_pass_to_uniform("positions", passes.position);
    passes.excrete_a.set_uniform("do_alpha", true);
    passes.render.link_pass_to_uniform("excretions",   passes.excrete_a);

    var colour_texture = new TextureLoader().load('assets/colour_gradient.jpg',
    function(texture){
      if(!running){
          animate(renderer.domElement, "opacity", "", 0.0, 1.0, 3.0);
          draw_loop();
          running = true;
        }
    });
    passes.render.set_uniform("colour_map",   colour_texture);
  }


  //any shader uniforms you want to change over time can be changed in the appropriate
  //computePasses update function. Each computePasses update function is called before it is rendered.
  function set_pass_update_functions(passes){

    let fps_target_delta = 1000.0/settings.fps_target;
    let start_time = Date.now();

    passes.velocity.set_update_function(function(){
      let elapsed = (Date.now()-start_time)/1000.0;
      passes.velocity.set_uniform("time",       elapsed);
      passes.velocity.set_uniform("sniff_rotation",  3.1415926*.8 + (Math.sin(elapsed/4)*3.14159/10.0));
      passes.velocity.set_uniform("sniff_odds",  ((Math.cos(elapsed/3.5) + 1)/2.0)*(settings.sniff_odds_max-settings.sniff_odds_min)+settings.sniff_odds_min);
    });

    let previous_time = 0;
    passes.position.set_update_function(function(){
      //framerate independent particle speeds
      let elapsed = (Date.now()-start_time);
      let time_delta_step = (elapsed-previous_time)/fps_target_delta;
      passes.position.set_uniform("time_delta_step", time_delta_step);
      previous_time = elapsed;
    });

  }


  function draw_loop() {
    gpu_compute_prog.render();
  	requestAnimationFrame( draw_loop );
  }


  //animate an css property over a certian amount of time without jquery
  function animate(element, property, unit, start, end, time, callback) {
      let initial_time = Date.now();
      let milli_step = (end-start)/(time*1000.0);

      function do_animate(){
        let passed_time = Date.now()-initial_time;
        let value = start+(milli_step*passed_time);

        if(passed_time < time*1000){
          element.style[property] = value + unit;
          requestAnimationFrame( do_animate );
        }else{
          element.style[property] = end + unit;
          if(!(callback === undefined)){
            callback();
          }
        }
      }

      do_animate();
  }

  function openFullscreen() {
    if (document.body.requestFullscreen) {
      document.body.requestFullscreen();
    } else if (document.body.mozRequestFullScreen) { /* Firefox */
      document.body.requestFullscreen.mozRequestFullScreen();
    } else if (document.body.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
      document.body.webkitRequestFullscreen();
    } else if (document.body.msRequestFullscreen) { /* IE/Edge */
      document.body.msRequestFullscreen();
    }
  }

}())
