Todo List
=========

+ Add pomodoro breaks.
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
  - Implement delta frames
  - Refactor frame upload code so that it uses global video/canvas elements
  - Implement camera disabling code (which will mutate said elements)
  - Instead of using setInterval, make it so that the upload code is responsible
    for rescheduling itself in an appropriate amount of time (so that we don't
    end up uploading several frames at once). Also remember that I need to stop
    the handler if the disable code tells us to stop.
