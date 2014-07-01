Todo List
=========

+ Add pomodoro breaks.
+ Fix the 'die' message so that it doesn't kick off duplicated clients. At the
  moment, the clients will appear to die until they send their next alive() :P
+ Add sounds for chat and pomodoro events. I'm thinking 1-2s vuvuzela sample for chat
  messages and siren for pomodoro events.
+ Work on video streaming of some sort. I'm not 100% clear on how I'll do this,
  but I think it will be WebRTC/TURN based. I may need to implement a supernode
  architecture if there are lots of clients (since n^2/2 connections = hell).
  EDIT: I'm going to just do server-based streaming with MJPEG (or maybe MJPEG +
  delta encoding). I'll add WebRTC when and if it gets traction amongst browser
  vendors.
