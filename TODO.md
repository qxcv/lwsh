Todo List
=========

+ Add pomodoro breaks.
+ Add a way of stopping pomodoros (ugh).
+ Fix the 'die' message so that it doesn't kick off duplicated clients. At the
  moment, the clients will appear to die until they send their next alive() :P
+ Add sounds for chat and pomodoro events. I'm thinking 1-2s vuvuzela sample for chat
  messages and siren for pomodoro events. The tricky bit here is figuring out
  how to add an "add message" handler into the reactive architecture.
+ Work on video streaming of some sort. I'm not 100% clear on how I'll do this,
  but I think it will be WebRTC/TURN based. I may need to implement a supernode
  architecture if there are lots of clients (since n^2/2 connections = hell).
  EDIT: I'm going to just do server-based streaming with MJPEG (or maybe MJPEG +
  delta encoding). I'll add WebRTC when and if it gets traction amongst browser
  vendors.
+ In the current frame upload code, I need to:
  - Get camera disabling to work. This probably requires destruction of the
    video source URL. IMO this is an API defect (if you accidentally lose the
    video from scope, the camera never stops recording!), but I have to work around
    it anyway.
  - Make delta frames work at an acceptable pace. At the moment they are so slow
    that they'll cause everything to freeze up and die with more than a few
    clients ;_;
+ Remove autopublish.
+ Refactor everything ruthlessly. The code is needlessly complex at the moment.
+ Fix the name overflow bug in the room occupants list. Also, put a length limit
  on names ;-)
+ Implement a UID-based user icon system. This should distinguish imposters from
  the genuine owners of a name (assuming that the genuine owners are sufficiently
  well known).
